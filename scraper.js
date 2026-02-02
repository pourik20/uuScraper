const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
// Fix for pdf-merger-js import update
const PDFMerger = require('pdf-merger-js').default || require('pdf-merger-js');

class Scraper {
    constructor(url) {
        this.url = url;
        this.browser = null;
        this.page = null;
        this.tempDir = path.join(__dirname, 'temp_pdfs');
        this.outputDir = path.join(__dirname, 'output');
        this.authFile = path.join(__dirname, 'auth.json');
    }

    async init() {
        // First check if we have a saved session
        const authExists = await fs.pathExists(this.authFile);
        
        if (authExists) {
             console.log('Saved coordinates found. Attempting hyperspace jump...');
             this.browser = await chromium.launch({ headless: true }); // Start headless immediately
             this.context = await this.browser.newContext({ storageState: this.authFile });
             this.page = await this.context.newPage();
             
             // Verify if session is still valid
              try {
                await this.page.goto(this.url);
                // Short timeout to check if we are logged in
                await this.page.waitForSelector('.plus4u5-app-button-authenticated', { timeout: 10000 });
                console.log('Connection established! Continuing mission in background...');
                
                // Ensure directories exist
                await fs.ensureDir(this.tempDir);
                await fs.ensureDir(this.outputDir);
                await fs.emptyDir(this.tempDir);
                return;
             } catch (e) {
                 console.log('Connection lost. New Jedi identification required...');
                 await this.browser.close();
             }
        }

        // Launch browser in headed mode for manual login
        this.browser = await chromium.launch({ headless: false });
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
        
        // Ensure directories exist
        await fs.ensureDir(this.tempDir);
        await fs.ensureDir(this.outputDir);
        await fs.emptyDir(this.tempDir); 
    }

    async login() {
        // If we are already on the page and authenticated (from init check), skip login
        if (this.page.url() === this.url) {
             try {
                if (await this.page.$('.plus4u5-app-button-authenticated')) return;
             } catch(e) {}
        }

        console.log('Heading to login sector...');
        await this.page.goto(this.url);

        console.log('Use the Force and log in manually in the browser window.');
        console.log('Waiting for identity confirmation...');
        
        // Strategy: Wait for the specific authenticated class on the +4U button 
        try {
             console.log('Scanning for authentication chip (.plus4u5-app-button-authenticated)...');
             // Wait for the authenticated button to appear
             await this.page.waitForSelector('.plus4u5-app-button-authenticated', { timeout: 0 }); 
             console.log('Identity confirmed! Saving navigation data...');
             
             // Save storage state (cookies, local storage)
             await this.context.storageState({ path: this.authFile });
             
             console.log('Data saved. Restarting systems to silent mode...');
             await this.browser.close();
             
             // Re-launch headless
             this.browser = await chromium.launch({ headless: true });
             this.context = await this.browser.newContext({ storageState: this.authFile });
             this.page = await this.context.newPage();
             await this.page.goto(this.url);
             await this.page.waitForLoadState('networkidle');

        } catch (e) {
            console.log('Detection error. Did you close the transition chamber? (Browser closed?)');
            throw e;
        }
    }

    async scrape() {
        console.log('Setting course to start of archive...');
        await this.rewindToStart();

        let pageIndex = 1;
        const merger = new PDFMerger();
        let hasNext = true;

        while (hasNext) {
            process.stdout.write(`\rDownloading Death Star plans... Page ${pageIndex}   `);
            
            // Optimized wait: prefer networkidle, fallback to short timeout
            try {
                // 1. Wait for Network (Data Load)
                try {
                    await this.page.waitForLoadState('networkidle', { timeout: 10000 });
                } catch(e) {
                    // Ignore network timeout, proceed to animation check
                }

                // 2. Wait for Visuals (Animations) - The "Smart" Part
                try {
                    await this.page.evaluate(async () => {
                        const animations = document.getAnimations();
                        if (animations.length > 0) {
                            await Promise.all(animations.map(a => a.finished));
                        }
                    });
                } catch(e) {
                    // Ignore animation check errors
                }

                // 3. Small Safety Buffer
                await this.page.waitForTimeout(500);
            } catch(e) {
                console.error('Wait error:', e);
            }
            
            const pdfPath = path.join(this.tempDir, `page_${pageIndex}.pdf`);
            
            await this.page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
            });
            
            await merger.add(pdfPath);
            pageIndex++;

            // Strategy: Use specific class from user provided HTML
            // Note: There might be two buttons (top and bottom), so we pick the first one.
            const nextBtn = this.page.locator('.uu-bookkit-control-bar-readers-next').first();
            
            if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
                // Check if disabled using the specific class "uu5-common-disabled" or attribute
                const classes = await nextBtn.getAttribute('class') || '';
                const isDisabled = classes.includes('uu5-common-disabled') || await nextBtn.getAttribute('disabled') !== null;
                
                if (!isDisabled) {
                    // console.log('Clicking "Další" (Next)...'); 
                    await nextBtn.click();
                    try {
                        // Quick wait for click reaction
                        // await this.page.waitForLoadState('networkidle', { timeout: 10000 });
                    } catch(e) {}
                } else {
                    console.log('\nThe "Next" button is disabled. We have reached the Outer Rim.');
                    hasNext = false;
                }
            } else {
                console.log('\nNavigation system found no further path. Mission end?');
                 hasNext = false;
            }
        }

        console.log('\nCompiling acquired materials into Holocron (PDF)...');
        
        let bookTitle = 'complete_book';
        try {
            const titleEl = await this.page.$('.uu-bookkit-book-top-text');
            if (titleEl) {
                const text = await titleEl.innerText();
                // Sanitize filename
                bookTitle = text.trim().replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '_').replace(/_+/g, '_');
                console.log(`Detected archive name: ${text} -> File: ${bookTitle}.pdf`);
            }
        } catch (e) {
            console.log('Unable to read archive name, using default designation.');
        }

        const finalPath = path.join(this.outputDir, `${bookTitle}.pdf`);
        await merger.save(finalPath);
        console.log(`Mission successful! Holocron saved in: ${finalPath}`);
        
        // Cleanup temp files
        console.log('Erasing tracks (deleting temporary files)...');
        await fs.remove(this.tempDir);
        console.log('Tracks erased. May the Force be with you.');
    }

    async rewindToStart() {
        console.log('Initiating reverse engine thrust...');
        let hasPrev = true;
        while (hasPrev) {
             const prevBtn = this.page.locator('.uu-bookkit-control-bar-readers-previous').first();
             
             if (await prevBtn.count() > 0 && await prevBtn.isVisible()) {
                 const classes = await prevBtn.getAttribute('class') || '';
                 const isDisabled = classes.includes('uu5-common-disabled') || await prevBtn.getAttribute('disabled') !== null;

                 if (!isDisabled) {
                     process.stdout.write('\rTraveling back in time...   ');
                     await prevBtn.click();
                     try {
                        await this.page.waitForLoadState('networkidle', { timeout: 3000 });
                     } catch(e) {/* ignore timeout */}
                     await this.page.waitForTimeout(200); 
                 } else {
                     hasPrev = false;
                 }
             } else {
                 hasPrev = false;
             }
        }
        console.log('\nWe are at the beginning of the story.');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = Scraper;

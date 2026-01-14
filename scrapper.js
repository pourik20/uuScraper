const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
// Fix for pdf-merger-js import update
const PDFMerger = require('pdf-merger-js').default || require('pdf-merger-js');

class Scrapper {
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
             console.log('Nalezeny uložené souřadnice galaxie. Pokouším se o skok do hyperprostoru...');
             this.browser = await chromium.launch({ headless: true }); // Start headless immediately
             this.context = await this.browser.newContext({ storageState: this.authFile });
             this.page = await this.context.newPage();
             
             // Verify if session is still valid
              try {
                await this.page.goto(this.url);
                // Short timeout to check if we are logged in
                await this.page.waitForSelector('.plus4u5-app-button-authenticated', { timeout: 10000 });
                console.log('Spojení navázáno! Pokračuji v misi na pozadí...');
                
                // Ensure directories exist
                await fs.ensureDir(this.tempDir);
                await fs.ensureDir(this.outputDir);
                await fs.emptyDir(this.tempDir);
                return;
             } catch (e) {
                 console.log('Spojení ztraceno. Vyžaduje se nová identifikace Jediho...');
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

        console.log('Směřuji loď do sektoru pro příhlášení...');
        await this.page.goto(this.url);

        console.log('Použij Sílu a přihlas se manuálně v okně prohlížeče.');
        console.log('Čekám na potvrzení identity...');
        
        // Strategy: Wait for the specific authenticated class on the +4U button 
        try {
             console.log('Skenuji přítomnost identifikačního čipu (.plus4u5-app-button-authenticated)...');
             // Wait for the authenticated button to appear
             await this.page.waitForSelector('.plus4u5-app-button-authenticated', { timeout: 0 }); 
             console.log('Identita potvrzena! Ukládám navigační data...');
             
             // Save storage state (cookies, local storage)
             await this.context.storageState({ path: this.authFile });
             
             console.log('Data uložena. Restartuji systémy do tichého režimu...');
             await this.browser.close();
             
             // Re-launch headless
             this.browser = await chromium.launch({ headless: true });
             this.context = await this.browser.newContext({ storageState: this.authFile });
             this.page = await this.context.newPage();
             await this.page.goto(this.url);
             await this.page.waitForLoadState('networkidle');

        } catch (e) {
            console.log('Chyba detekce. Zavřel jsi přechodovou komoru? (Browser closed?)');
            throw e;
        }
    }

    async scrape() {
        console.log('Nastavuji kurz na začátek archivu...');
        await this.rewindToStart();

        let pageIndex = 1;
        const merger = new PDFMerger();
        let hasNext = true;

        while (hasNext) {
            process.stdout.write(`\rStahuji plány Hvězdy smrti... Stránka ${pageIndex}   `);
            
            // Optimized wait: prefer networkidle, fallback to short timeout
            try {
                await this.page.waitForLoadState('networkidle', { timeout: 5000 });
                // Small buffer for rendering to finish
                await this.page.waitForTimeout(500); 
            } catch(e) {
                // If networkidle times out, we assume it's mostly loaded or streaming.
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
                    console.log('\nTlačítko "Další" je deaktivované. Dosáhli jsme hranice Vnějšího okraje.');
                    hasNext = false;
                }
            } else {
                console.log('\nNavigační systém nenašel cestu dál. Konec mise?');
                 hasNext = false;
            }
        }

        console.log('\nKompletuji získané materiály do Holocronu (PDF)...');
        
        let bookTitle = 'complete_book';
        try {
            const titleEl = await this.page.$('.uu-bookkit-book-top-text');
            if (titleEl) {
                const text = await titleEl.innerText();
                // Sanitize filename
                bookTitle = text.trim().replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '_').replace(/_+/g, '_');
                console.log(`Detekován název archivu: ${text} -> Soubor: ${bookTitle}.pdf`);
            }
        } catch (e) {
            console.log('Nelze přečíst název archivu, používám defaultní označení.');
        }

        const finalPath = path.join(this.outputDir, `${bookTitle}.pdf`);
        await merger.save(finalPath);
        console.log(`Mise úspěšná! Holocron uložen v: ${finalPath}`);
        
        // Cleanup temp files
        console.log('Zametám stopy (mazání dočasných souborů)...');
        await fs.remove(this.tempDir);
        console.log('Stopy zahlazeny. Ať tě provází Síla.');
    }

    async rewindToStart() {
        console.log('Iniciuji zpětný chod motorů...');
        let hasPrev = true;
        while (hasPrev) {
             const prevBtn = this.page.locator('.uu-bookkit-control-bar-readers-previous').first();
             
             if (await prevBtn.count() > 0 && await prevBtn.isVisible()) {
                 const classes = await prevBtn.getAttribute('class') || '';
                 const isDisabled = classes.includes('uu5-common-disabled') || await prevBtn.getAttribute('disabled') !== null;

                 if (!isDisabled) {
                     process.stdout.write('\rCestuji zpět v čase...   ');
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
        console.log('\nJsme na začátku příběhu.');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = Scrapper;

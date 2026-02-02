const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
const PDFMerger = require('pdf-merger-js').default || require('pdf-merger-js');

// Constants for configuration and selectors
const CONFIG = {
    SELECTORS: {
        AUTHENTICATED_BTN: '.plus4u5-app-button-authenticated',
        NEXT_BTN: '.uu-bookkit-control-bar-readers-next',
        PREV_BTN: '.uu-bookkit-control-bar-readers-previous',
        BOOK_TITLE: '.uu-bookkit-book-top-text',
        DISABLED_CLASS: 'uu5-common-disabled'
    },
    TIMEOUTS: {
        AUTH_CHECK: 10000,
        NETWORK_IDLE: 5000,
        ANIMATION_BUFFER: 500, // Safety buffer
        INITIAL_WAIT: 500 // Before checking network
    },
    PATHS: {
        TEMP_DIR: 'temp_pdfs',
        OUTPUT_DIR: 'output',
        AUTH_FILE: 'auth.json'
    }
};

class Scraper {
    constructor(url) {
        this.url = url;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.tempDir = path.join(__dirname, CONFIG.PATHS.TEMP_DIR);
        this.outputDir = path.join(__dirname, CONFIG.PATHS.OUTPUT_DIR);
        this.authFile = path.join(__dirname, CONFIG.PATHS.AUTH_FILE);
    }

    /**
     * Initializes the scraper, ensuring directories exist and handling browser launch.
     */
    async init() {
        await this._ensureDirectories();

        const authExists = await fs.pathExists(this.authFile);
        if (authExists) {
            console.log('Session coordinates found. Attempting hyperspace jump (Headless Mode)...');
            try {
                await this._launchBrowser(true, this.authFile);
                await this.page.goto(this.url);
                await this.page.waitForSelector(CONFIG.SELECTORS.AUTHENTICATED_BTN, { timeout: CONFIG.TIMEOUTS.AUTH_CHECK });
                console.log('Connection established! Continuing mission...');
                return;
            } catch (e) {
                console.log('Connection lost. New Jedi identification required (Session expired)...');
                await this.close();
            }
        } else {
            console.log('No session found. Preparing for manual entry...');
        }

        // Fallback to manual login if session missing or invalid
        await this._launchBrowser(false);
    }

    /**
     * Handles the login process if not already authenticated.
     */
    async login() {
        if (this.page.url() === this.url) {
            try {
                if (await this.page.$(CONFIG.SELECTORS.AUTHENTICATED_BTN)) return;
            } catch (e) {}
        }

        console.log('Heading to login sector...');
        await this.page.goto(this.url);

        console.log('ACTION REQUIRED: Log in manually in the browser window.');
        console.log('Waiting for identity confirmation...');

        try {
            await this.page.waitForSelector(CONFIG.SELECTORS.AUTHENTICATED_BTN, { timeout: 0 }); // Wait indefinitely for user
            console.log('Identity confirmed! Saving navigation data...');

            await this.context.storageState({ path: this.authFile });
            console.log('Data saved. Restarting systems to silent mode...');
            
            await this.close();
            await this._launchBrowser(true, this.authFile);
            
            await this.page.goto(this.url);
            await this.page.waitForLoadState('networkidle');
        } catch (e) {
            console.error('Detection error during login sequence.');
            throw e;
        }
    }

    /**
     * Main scraping loop.
     */
    async scrape() {
        console.log('Setting course to start of archive...');
        await this._rewindToStart();

        let pageIndex = 1;
        const merger = new PDFMerger();
        let hasNext = true;

        console.log('\n--- STARTING DOWNLOAD SEQUENCE ---');

        while (hasNext) {
            process.stdout.write(`\rDownloading Death Star plans... Page ${pageIndex}   `);
            
            await this._waitForContentToSettle();
            
            const pdfPath = path.join(this.tempDir, `page_${pageIndex}.pdf`);
            await this.page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
            });

            await merger.add(pdfPath);
            pageIndex++;

            hasNext = await this._goToNextPage();
        }

        console.log('\n--- DOWNLOAD SEQUENCE COMPLETE ---');
        await this._saveFinalPdf(merger);
        await this._cleanup();
    }

    // --- Private Helper Methods ---

    async _launchBrowser(headless, storageStatePath = null) {
        this.browser = await chromium.launch({ headless });
        const options = storageStatePath ? { storageState: storageStatePath } : {};
        this.context = await this.browser.newContext(options);
        this.page = await this.context.newPage();
    }

    async _ensureDirectories() {
        await fs.ensureDir(this.tempDir);
        await fs.ensureDir(this.outputDir);
        await fs.emptyDir(this.tempDir);
    }

    async _waitForContentToSettle() {
        try {
            // 1. Brief pause for network request initiation
            await this.page.waitForTimeout(CONFIG.TIMEOUTS.INITIAL_WAIT);

            // 2. Wait for Network Idle (Data Load)
            try {
                await this.page.waitForLoadState('networkidle', { timeout: CONFIG.TIMEOUTS.NETWORK_IDLE });
            } catch (e) {
                // Ignore timeout (e.g., streaming connections), proceed to check animations
            }

            // 3. Wait for Active Animations (Fade-ins, Transitions)
            try {
                await this.page.evaluate(async () => {
                    const animations = document.getAnimations();
                    if (animations.length > 0) {
                        await Promise.all(animations.map(a => a.finished));
                    }
                });
            } catch (e) {
                // Keep going if animation check fails
            }

            // 4. Final safety buffer
            await this.page.waitForTimeout(CONFIG.TIMEOUTS.ANIMATION_BUFFER);

        } catch (e) {
            console.warn('Warning: Wait cycle incomplete.', e.message);
        }
    }

    async _goToNextPage() {
        const nextBtn = this.page.locator(CONFIG.SELECTORS.NEXT_BTN).first();

        if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
            const classes = await nextBtn.getAttribute('class') || '';
            const isDisabled = classes.includes(CONFIG.SELECTORS.DISABLED_CLASS) || await nextBtn.getAttribute('disabled') !== null;

            if (!isDisabled) {
                await nextBtn.click();
                return true;
            } else {
                console.log('\nThe "Next" button is disabled. Archive limit reached.');
                return false;
            }
        }
        
        console.log('\nNavigation system found no further path. Mission end?');
        return false;
    }

    async _rewindToStart() {
        console.log('Initiating reverse engine thrust...');
        let hasPrev = true;
        while (hasPrev) {
            const prevBtn = this.page.locator(CONFIG.SELECTORS.PREV_BTN).first();
            if (await prevBtn.count() > 0 && await prevBtn.isVisible()) {
                 const classes = await prevBtn.getAttribute('class') || '';
                 const isDisabled = classes.includes(CONFIG.SELECTORS.DISABLED_CLASS) || await prevBtn.getAttribute('disabled') !== null;
                 
                 if (!isDisabled) {
                     process.stdout.write('\rTraveling back in time...   ');
                     await prevBtn.click();
                     await this.page.waitForTimeout(200); // Quick step for rewind
                 } else {
                     hasPrev = false;
                 }
            } else {
                hasPrev = false;
            }
        }
        console.log('\nWe are at the beginning of the story.');
    }

    async _saveFinalPdf(merger) {
        console.log('Compiling acquired materials into Holocron (PDF)...');
        let bookTitle = 'complete_book';
        try {
            const titleEl = await this.page.$(CONFIG.SELECTORS.BOOK_TITLE);
            if (titleEl) {
                const text = await titleEl.innerText();
                bookTitle = text.trim().replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '_').replace(/_+/g, '_');
                console.log(`Detected archive name: ${text}`);
            }
        } catch (e) {
            console.log('Unable to read archive name, using default designation.');
        }

        const finalPath = path.join(this.outputDir, `${bookTitle}.pdf`);
        await merger.save(finalPath);
        console.log(`Mission successful! Holocron saved in: ${finalPath}`);
    }

    async _cleanup() {
        console.log('Erasing tracks (deleting temporary files)...');
        await fs.remove(this.tempDir);
        console.log('Tracks erased. May the Force be with you.');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}

module.exports = Scraper;

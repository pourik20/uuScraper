const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
const PDFMerger = require('pdf-merger-js').default || require('pdf-merger-js');
const UuToMarkdown = require('./converter');

const CONFIG = {
    SELECTORS: {
        AUTHENTICATED_BTN: '.plus4u5-app-button-authenticated',
        BOOK_TITLE: '.uu-bookkit-book-top-text'
    },
    PATHS: {
        OUTPUT_DIR: 'output',
        AUTH_FILE: 'auth.json'
    }
};

class AdvancedScraper {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            format: options.format || 'markdown', // 'markdown', 'pdf', or 'both'
            language: options.language || 'cs',
            ...options
        };
        
        // Extract base API URL from book URL
        // Example: https://uuapp.plus4u.net/uu-bookkit-maing01/3983da877bf74b36bb8d33c316118512
        const match = url.match(/(https:\/\/.*\/uu-bookkit-maing01\/[a-f0-9]+)/);
        this.apiBase = match ? match[1] : null;
        
        this.browser = null;
        this.context = null;
        this.page = null;
        this.bearerToken = null;
        this.converter = new UuToMarkdown();
        this.outputDir = path.join(__dirname, CONFIG.PATHS.OUTPUT_DIR);
    }

    async run() {
        if (!this.apiBase) throw new Error('Invalid uuBook URL');
        
        await fs.ensureDir(this.outputDir);
        await this.initBrowser();
        await this.ensureAuth();
        
        console.log('Fetching book structure...');
        const bookData = await this.apiCall('loadBook', {});
        console.log('Book Data keys:', Object.keys(bookData));
        const bookTitle = this.getLocalized(bookData.name);
        console.log(`Book: ${bookTitle}`);

        const pages = await this.getBookPages(bookData);
        console.log(`Found ${pages.length} pages.`);

        let fullMarkdown = `# ${bookTitle}\n\n`;
        const merger = (this.options.format === 'pdf' || this.options.format === 'both') ? new PDFMerger() : null;

        for (const pageInfo of pages) {
            console.log(`Processing: ${this.getLocalized(pageInfo.name)} (${pageInfo.code})...`);
            const pageData = await this.apiCall('loadPage', { code: pageInfo.code });
            
            if (pageData.uuAppErrorMap) {
                console.log(`Error loading page ${pageInfo.code}:`, JSON.stringify(pageData.uuAppErrorMap));
            }

            // 1. Convert to Markdown
            if (this.options.format === 'markdown' || this.options.format === 'both') {
                const pageMd = this.processPageToMd(pageData);
                fullMarkdown += `## ${this.getLocalized(pageData.name || pageInfo.name)}\n\n${pageMd}\n\n---\n\n`;
            }
// ... rest of the loop
            // 2. Export to PDF (optional)
            if (merger) {
                const pdfPath = await this.exportPageToPdf(pageInfo.code);
                await merger.add(pdfPath);
                await fs.remove(pdfPath); // Clean up temp individual page PDF
            }
        }

        // Save results
        const safeTitle = bookTitle.replace(/[^a-z0-9]/gi, '_');
        
        if (fullMarkdown && (this.options.format === 'markdown' || this.options.format === 'both')) {
            const mdPath = path.join(this.outputDir, `${safeTitle}.md`);
            await fs.writeFile(mdPath, fullMarkdown);
            console.log(`Markdown saved to: ${mdPath}`);
        }

        if (merger) {
            const pdfPath = path.join(this.outputDir, `${safeTitle}.pdf`);
            await merger.save(pdfPath);
            console.log(`PDF saved to: ${pdfPath}`);
        }

        await this.close();
    }

    async initBrowser() {
        const authFile = path.join(__dirname, CONFIG.PATHS.AUTH_FILE);
        const hasAuth = await fs.pathExists(authFile);
        
        this.browser = await chromium.launch({ headless: hasAuth });
        this.context = await this.browser.newContext(hasAuth ? { storageState: authFile } : {});
        this.page = await this.context.newPage();

        // Token interceptor
        this.page.on('request', req => {
            const auth = req.headers()['authorization'];
            if (auth && auth.startsWith('Bearer ') && req.url().includes('bookkit')) {
                this.bearerToken = auth.replace('Bearer ', '');
            }
        });
    }

    async ensureAuth() {
        await this.page.goto(this.url);
        
        try {
            await this.page.waitForSelector(CONFIG.SELECTORS.AUTHENTICATED_BTN, { timeout: 10000 });
        } catch (e) {
            console.log('Login required. Please log in in the browser window...');
            await this.page.waitForSelector(CONFIG.SELECTORS.AUTHENTICATED_BTN, { timeout: 0 });
            const authFile = path.join(__dirname, CONFIG.PATHS.AUTH_FILE);
            await this.context.storageState({ path: authFile });
            console.log('Session saved.');
        }

        // Ensure we have a token by waiting for any API call
        if (!this.bearerToken) {
            await this.page.reload({ waitUntil: 'networkidle' });
        }
    }

    async apiCall(cmd, data) {
        return await this.page.evaluate(async ({ url, cmd, data, token }) => {
            // Updated heuristic: most commands in uuBookKit are GET
            // except for specific ones that might need POST
            const method = (cmd === 'loadPage' || cmd === 'loadBook' || cmd === 'getProtocol' || cmd === 'listPages') ? 'GET' : 'POST';
            let finalUrl = `${url}/${cmd}`;
            const options = {
                method: method,
                headers: { 
                    'Authorization': 'Bearer ' + token
                }
            };
            
            if (method === 'POST') {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            } else if (data && Object.keys(data).length > 0) {
                const params = new URLSearchParams(data);
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + params.toString();
            }

            const resp = await fetch(finalUrl, options);
            return await resp.json();
        }, { url: this.apiBase, cmd, data, token: this.bearerToken });
    }

    async getBookPages(bookData) {
        // First try the custom menu structure
        const pages = [];
        const traverse = (items) => {
            if (!items) return;
            for (const item of items) {
                if (item.type === 'page' || item.pageCode) {
                    pages.push({
                        code: item.pageCode || item.code,
                        name: item.label || item.name
                    });
                }
                if (item.items) traverse(item.items);
            }
        };

        if (bookData.menu) {
             traverse(bookData.menu);
        } else if (bookData.structure) {
             traverse(bookData.structure);
        }

        // If still no pages, try listing them via API
        if (pages.length === 0) {
            try {
                const listData = await this.apiCall('listPages', {});
                if (listData.itemList) {
                    return listData.itemList.map(p => ({ code: p.code, name: p.name }));
                }
            } catch (e) {}
        }

        return pages;
    }

    processPageToMd(pageData) {
        let md = '';
        let blocks = pageData.body || [];
        if (!Array.isArray(blocks) && blocks.content) {
             blocks = blocks.content;
        }
        
        if (!Array.isArray(blocks)) {
            console.log(`Warning: Page blocks is not an array for ${this.getLocalized(pageData.name)}`);
            return md;
        }

        console.log(`Page: ${this.getLocalized(pageData.name)} has ${blocks.length} blocks.`);
        for (const block of blocks) {
            const content = block.content || (block.data && block.data.content);
            if (content) {
                const converted = this.converter.parse(content, this.options.language);
                md += converted + '\n\n';
            }
        }
        return md;
    }

    async exportPageToPdf(pageCode) {
        const pageUrl = `${this.url}/book/page?code=${pageCode}`;
        const tempPage = await this.context.newPage();
        await tempPage.goto(pageUrl, { waitUntil: 'networkidle' });
        
        // Wait for potential uu5 components to render
        await tempPage.waitForTimeout(2000); 
        
        const tempPath = path.join(this.outputDir, `temp_${pageCode}.pdf`);
        await tempPage.pdf({
            path: tempPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
        });
        await tempPage.close();
        return tempPath;
    }

    getLocalized(obj) {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[this.options.language] || obj['en'] || (obj && Object.values(obj)[0]) || '';
    }

    async close() {
        if (this.browser) await this.browser.close();
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node advanced_scraper.js <url> [format: markdown|pdf|both]');
        process.exit(1);
    }
    const scraper = new AdvancedScraper(args[0], { format: args[1] || 'both' });
    scraper.run().catch(console.error);
}

module.exports = AdvancedScraper;

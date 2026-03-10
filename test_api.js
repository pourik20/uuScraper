const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://uuapp.plus4u.net/uu-bookkit-maing01/3983da877bf74b36bb8d33c316118512';
const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    // Navigate to book first to establish OIDC session
    console.log('Navigating to book...');
    await page.goto(BASE + '/book/page?code=home', { waitUntil: 'networkidle' });

    // Now try to call the API endpoints from browser context
    console.log('\n=== Trying loadPage via fetch ===');
    const result = await page.evaluate(async (base) => {
        try {
            const resp = await fetch(base + '/loadPage?code=systemsOfLinearEquations');
            const text = await resp.text();
            return { status: resp.status, body: text.substring(0, 3000) };
        } catch (e) {
            return { error: e.message };
        }
    }, BASE);
    console.log(JSON.stringify(result, null, 2));

    // Also try getBookStructure
    console.log('\n=== Trying getBookStructure ===');
    const struct = await page.evaluate(async (base) => {
        try {
            const resp = await fetch(base + '/getBookStructure');
            const data = await resp.json();
            return { status: resp.status, keys: Object.keys(data) };
        } catch (e) {
            return { error: e.message };
        }
    }, BASE);
    console.log(JSON.stringify(struct, null, 2));

    // Check what network requests were made during page load
    console.log('\n=== Checking for token in localStorage ===');
    const tokens = await page.evaluate(() => {
        const items = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('token') || key.includes('oidc') || key.includes('auth')) {
                items[key] = localStorage.getItem(key).substring(0, 200);
            }
        }
        return items;
    });
    console.log(JSON.stringify(tokens, null, 2));

    await browser.close();
})();

const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://uuapp.plus4u.net/uu-bookkit-maing01/3983da877bf74b36bb8d33c316118512';
const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    // Intercept all requests to see auth headers
    const apiCalls = [];
    page.on('request', req => {
        const url = req.url();
        if (url.includes('plus4u.net') && (url.includes('load') || url.includes('get') || url.includes('list') || url.includes('oidc') || url.includes('grant') || url.includes('token'))) {
            apiCalls.push({
                url: url.substring(0, 150),
                method: req.method(),
                headers: Object.fromEntries(
                    Object.entries(req.headers()).filter(([k]) => 
                        k.includes('auth') || k.includes('cookie') || k.includes('bearer') || k === 'authorization'
                    )
                )
            });
        }
    });

    page.on('response', async resp => {
        const url = resp.url();
        if (url.includes('loadPage') || url.includes('grantToken') || url.includes('loadBook')) {
            try {
                const body = await resp.text();
                console.log(`\nRESPONSE ${resp.status()} ${url.substring(0, 100)}`);
                console.log(body.substring(0, 500));
            } catch(e) {}
        }
    });

    console.log('Navigating to book page...');
    await page.goto(BASE + '/book/page?code=systemsOfLinearEquations', { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`\n=== Captured ${apiCalls.length} API calls ===`);
    apiCalls.forEach((c, i) => {
        console.log(`\n--- Call ${i + 1} ---`);
        console.log(`${c.method} ${c.url}`);
        console.log('Auth headers:', JSON.stringify(c.headers));
    });

    // Check if we're logged in
    const isLoggedIn = await page.$('.plus4u5-app-button-authenticated');
    console.log('\nLogged in:', !!isLoggedIn);

    await browser.close();
})();

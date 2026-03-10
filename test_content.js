const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://uuapp.plus4u.net/uu-bookkit-maing01/3983da877bf74b36bb8d33c316118512';
const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    // Capture the Bearer token from any authenticated request
    let bearerToken = null;
    page.on('request', req => {
        const auth = req.headers()['authorization'];
        if (auth && auth.startsWith('Bearer ') && req.url().includes('bookkit')) {
            bearerToken = auth.replace('Bearer ', '');
        }
    });

    // Also capture loadPage response directly
    let loadPageData = null;
    page.on('response', async resp => {
        if (resp.url().includes('loadPage') && resp.status() === 200) {
            try {
                loadPageData = await resp.json();
            } catch(e) {}
        }
    });

    // Navigate to the actual page - this triggers loadPage API call automatically
    console.log('Navigating...');
    await page.goto(BASE + '/book/page?code=systemsOfLinearEquations', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Bearer token captured:', !!bearerToken);
    console.log('Token length:', bearerToken ? bearerToken.length : 0);

    if (loadPageData) {
        console.log('\n=== loadPage response keys ===');
        console.log(Object.keys(loadPageData));
        console.log('\n=== Page name ===');
        console.log(loadPageData.name);
        console.log('\n=== Body content (first 2000 chars) ===');
        const body = loadPageData.body?.content || loadPageData.body || '';
        console.log(typeof body === 'string' ? body.substring(0, 2000) : JSON.stringify(body).substring(0, 2000));
    }

    // Now try using the token directly
    if (bearerToken) {
        console.log('\n=== Testing direct API call with captured token ===');
        const result = await page.evaluate(async ({base, token}) => {
            const resp = await fetch(base + '/loadPage?code=zakladnePojmy', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await resp.json();
            return { status: resp.status, keys: Object.keys(data), name: data.name, bodySnippet: (data.body?.content || '').substring(0, 500) };
        }, { base: BASE, token: bearerToken });
        console.log(JSON.stringify(result, null, 2));
    }

    await browser.close();
})();

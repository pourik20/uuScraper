const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');

const BASE = 'https://uuapp.plus4u.net/uu-bookkit-maing01/3983da877bf74b36bb8d33c316118512';
const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    // Capture the Bearer token from API calls
    let bearerToken = null;
    page.on('request', req => {
        const url = req.url();
        const auth = req.headers()['authorization'];
        if (auth && auth.startsWith('Bearer ') && url.includes('bookkit')) {
            bearerToken = auth.replace('Bearer ', '');
        }
    });

    console.log('Navigating to get auth token...');
    await page.goto(BASE + '/book/page?code=home', { waitUntil: 'networkidle', timeout: 30000 });

    if (!bearerToken) {
        console.error('No bearer token captured!');
        await browser.close();
        return;
    }

    console.log('Token captured! Length:', bearerToken.length);

    // Now use the token directly with fetch from node
    const https = require('https');

    const fetchPage = (code) => new Promise((resolve, reject) => {
        const url = `${BASE}/loadPage?code=${code}`;
        const req = https.get(url, { headers: { 'Authorization': `Bearer ${bearerToken}` } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
    });

    console.log('\nFetching page: systemsOfLinearEquations...');
    const pageData = await fetchPage('systemsOfLinearEquations');

    if (pageData.uuAppErrorMap) {
        console.error('Error:', JSON.stringify(pageData.uuAppErrorMap));
    } else {
        console.log('SUCCESS! Keys:', Object.keys(pageData));
        console.log('Name:', JSON.stringify(pageData.name));
        // Print body content (first 2000 chars)
        const body = pageData.body?.content || pageData.body || '';
        console.log('\nBody (first 2000 chars):');
        console.log(typeof body === 'string' ? body.substring(0, 2000) : JSON.stringify(body).substring(0, 2000));
    }

    await browser.close();
})();

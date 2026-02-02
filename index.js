const Scraper = require('./scraper');

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: node index.js <book-url>');
        process.exit(1);
    }

    const bookUrl = args[0];
    console.log(`Executing Order 66: ${bookUrl}`);

    const scraper = new Scraper(bookUrl);
    
    try {
        await scraper.init();
        await scraper.login();
        await scraper.scrape();
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await scraper.close();
    }
}

main();

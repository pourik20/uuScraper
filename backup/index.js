const Scraper = require('./scraper');

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: node index.js <book-url>');
        process.exit(1);
    }

    const bookUrl = args[0];
    console.log(`\nInitializing uuScraper for: ${bookUrl}\n`);

    const scraper = new Scraper(bookUrl);
    
    try {
        await scraper.init();
        await scraper.login();
        await scraper.scrape();
    } catch (error) {
        console.error('\nCRITICAL FAILURE: Operation aborted due to an error.');
        console.error(error);
        process.exit(1);
    } finally {
        await scraper.close();
    }
}

main();

const Scrapper = require('./scrapper');

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Použití: node index.js <url-knihy-clena-odboje>');
        process.exit(1);
    }

    const bookUrl = args[0];
    console.log(`Startuji uuBook Protocol Droid pro: ${bookUrl}`);

    const scrapper = new Scrapper(bookUrl);
    
    try {
        await scrapper.init();
        await scrapper.login();
        await scrapper.scrape();
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await scrapper.close();
    }
}

main();

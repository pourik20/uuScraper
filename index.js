const AdvancedScraper = require('./advanced_scraper');

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node index.js <url> [format: markdown|pdf|both]');
        process.exit(1);
    }

    const url = args[0];
    const format = args[1] || 'both';

    console.log(`\n--- uuScraper Advanced (Markdown + PDF) ---`);
    console.log(`Target: ${url}`);
    console.log(`Format: ${format}\n`);

    const scraper = new AdvancedScraper(url, { format });
    
    try {
        await scraper.run();
        console.log('\nAll done! Your files are in the output/ directory.');
    } catch (error) {
        console.error('\nFATAL ERROR:', error.message);
        process.exit(1);
    }
}

main();

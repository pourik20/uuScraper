# uuScraper

A Node.js tool designed to scrape [uuBookKit](https://www.uubookkit.com/) books and compile them into a single PDF file.

## Features

- **Automated Navigation**: Automatically navigates to the beginning of the book.
- **PDF Generation**: Captures each page as a PDF.
- **Merging**: Combines all pages into a final, single PDF file.
- **Session Management**: Saves login sessions (`auth.json`) to skip manual login on subsequent runs.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)

## Installation

1. Clone the repository or download the source code.
2. Install dependencies:

```bash
npm install
```

## Usage

Run the scraper by providing the URL of the uuBook you want to scrape:

```bash
node index.js <book-url>
```

**Example:**

```bash
node index.js "https://uuapp.plus4u.net/uu-bookkit-maing01/..."
```

### First Run (Authentication)

1. On the first run, a browser window will open.
2. Log in to your Plus4U account manually.
3. Wait for the authentication to complete. The script will detect the successful login, save your session, and then automatically restart in headless mode (background) to begin scraping.

### Output

The final PDF will be saved in the `output/` directory with the name of the book.

## Disclaimer

This tool is for educational purposes only. The authors are not responsible for any misuse of this tool or violations of Terms of Service. Please respect copyright laws and the platform's rules.

## Known Limitations

- **UI Changes**: This scraper relies on specific HTML classes (e.g., buttons, readers). If the platform updates its design, the scraper may break and require code updates.

## Troubleshooting

- **Browsers Not Found**: If you see an error about missing browsers, run:
  ```bash
  npx playwright install
  ```
- **Login Issues**: If the scraper fails to detect login, try closing the browser and running the command again.
- **Timeout**: If your connection is slow, the "smart wait" logic usually handles it, but very slow connections might still time out.


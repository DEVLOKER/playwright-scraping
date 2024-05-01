// Import necessary libraries
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { saveToJsonFile, saveToCsvFile, downloadImages, log } from "./utils.js";

/**
 * Constants used in the web scraping process.
 */

// Base URL of the website to scrape.
const baseURL = "https://www.ouedkniss.com";

// Type of product to scrape. Choose from the provided options.
const productType = [
    "automobiles", // Example: cars category
    "telephones", // Example: phones category
    "informatique-ordinateur-portable", // Example: Computers & Laptops category
][2]; // Select the desired product type from the array.

// Filter to apply to the URL, such as having price and pictures.
const filter = "?hasPrice=true&hasPictures=true";

// Complete URL to scrape, constructed from the base URL, product type, and filter.
const url = `${baseURL}/${productType}${filter}`;

// Number of pages to scrape for each product category.
const numberOfPagesToScrape = 1;

// Flag indicating whether to download images associated with the scraped products.
const withDownloadingImages = true;

// CSS selector paths used to locate elements on the webpage.
const searchContainerPath = ".search .v-lazy:nth-child(4) .search-view-item"; // Selector for the search container element.
const paginationPath = ".search-view-pagination .pagination"; // Selector for pagination element.
const nextPageLinkPath = `${paginationPath} .v-pagination__next`; // Selector for the next page button.
const resultsDir = path.join("results", productType); // Directory path to save the results.

// Functions

/**
 * Scrolls down the page until no more content is loaded.
 * @param {Page} page - The Playwright page object.
 * @param {number} nbPage - The page number for logging purposes.
 */
const scrollDownUntilNoMoreContent = async (page, nbPage) => {
    log(`scroll down until no more content in page : ${nbPage}`);

    // Presses the "End" key to scroll to the bottom of the page.
    await page.keyboard.down("End");

    // Waits for the search container element to appear on the page.
    await page.waitForSelector(searchContainerPath);

    // Scrolls down the page until the bottom is reached.
    await page.waitForFunction(async () => {
        let totalHeight = 0,
            scrollHeight = 0;
        await new Promise((resolve, reject) => {
            const distance = 100,
                delay = 100;
            const timer = setInterval(() => {
                scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve(true);
                }
            }, delay);
        });
    });

    // Waits for the page to reach a stable state with no network activity.
    await page.waitForLoadState("networkidle");
};

/**
 * Scrapes the content of the current page.
 * @param {Page} page - The Playwright page object.
 * @param {number} nbPage - The page number for logging purposes.
 * @returns {Array} - An array containing the scraped products.
 */
const scrapePageContent = async (page, nbPage) => {
    // Scrolls down the page until no more content is loaded.
    await scrollDownUntilNoMoreContent(page, nbPage);

    // Logs the page URL being scraped.
    log(`Scraping content of page ${nbPage}: ${await page.url()}`);

    // Evaluates JavaScript in the context of the page to scrape product data.
    const currentPageProducts = await page.evaluate(
        /**
         * Extracts product information from the page.
         * @param {string} searchContainerPath - The CSS selector for the search items.
         * @returns {Array} - An array containing the scraped product data.
         */
        ({ searchContainerPath }) => {
            const items = document.querySelectorAll(searchContainerPath);
            return [...items].map((item) => {
                const product = item.querySelector(".v-card.o-announ-card");
                if (product) {
                    const imgEl = product.querySelector(
                        ".o-announ-card-image img"
                    );
                    const titleEl = product.querySelector(
                        "h3.o-announ-card-title"
                    );
                    const priceEl = product.querySelectorAll(
                        "span.price > span > div"
                    );
                    const infosEl = product.querySelectorAll(
                        "div.col.py-0.px-0.my-1 > span.v-chip"
                    );
                    const othersEl = product.querySelectorAll(
                        ".mb-1.d-flex.flex-column.flex-gap-1.line-height-1 > span"
                    );
                    return {
                        id: item.getAttribute("id"),
                        img: imgEl.getAttribute("src"),
                        title: titleEl.textContent.trim(),
                        price: {
                            value: priceEl?.[0]?.textContent.trim() ?? "",
                            unit: priceEl?.[1]?.textContent.trim() ?? "",
                        },
                        infos: Array.from(infosEl).map((info) =>
                            info.textContent.trim()
                        ),
                        state: othersEl?.[0]?.textContent.trim() ?? "",
                        timeAgo: othersEl?.[1]?.textContent.trim() ?? "",
                    };
                }
            });
        },
        { searchContainerPath }
    );

    // Logs the number of scraped results.
    log(`Scrap results: ${currentPageProducts.length}`);

    // Returns the scraped product data.
    return currentPageProducts;
};

/**
 * Navigates to the next page of search results.
 * @param {Page} page - The Playwright page object.
 * @param {number} nbPage - The page number for logging purposes.
 * @throws {Error} - If unable to navigate to the next page.
 */
const navigateToNextPage = async (page, nbPage) => {
    // Waits for the next page link to appear on the page.
    await page.waitForSelector(nextPageLinkPath);

    // Locates the next page link element on the page.
    const nextPageLink = await page.locator(nextPageLinkPath);

    // Checks if the next page link is found.
    if (nextPageLink) {
        // Clicks the next page link and waits for the search container element to appear.
        await Promise.all([
            nextPageLink.click(),
            page.waitForSelector(searchContainerPath),
        ]);

        // Logs the navigation to the next page.
        log(`Navigating to the next page ${nbPage}: ${await page.url()}`);
    } else {
        // Throws an error if unable to navigate to the next page.
        throw new Error(
            `Can't navigate to the next page: ${nbPage}: ${await page.url()}`
        );
    }
};

/**
 * Saves scraped data to JSON, CSV, and optionally downloads images.
 * @param {string} productType - The type of product being saved.
 * @param {Array} products - An array containing the scraped product data.
 */
const saveData = async (productType, products) => {
    // Creates a directory to store results, including images.
    fs.mkdirSync(resultsDir, { recursive: true });
    const imagesPath = path.join(resultsDir, "images");
    fs.mkdirSync(imagesPath, { recursive: true });

    // Constructs the filename for JSON and CSV files.
    const filename = path.join(resultsDir, `${productType}`);

    // Saves scraped data to JSON file.
    saveToJsonFile(`${filename}.json`, products);

    // Saves scraped data to CSV file.
    await saveToCsvFile(path.join(`${filename}.csv`), products);

    // Optionally downloads images associated with the scraped data.
    if (withDownloadingImages) {
        await downloadImages(imagesPath, products);
    }
};

/**
 * Main function to orchestrate the web scraping process.
 */
(async () => {
    // Launches a new Chromium browser instance.
    const browser = await chromium.launch({ headless: false }); // Consider making headless: true for production

    // Creates a new browser context.
    const context = await browser.newContext();

    // Opens a new page in the browser context.
    const page = await context.newPage();

    try {
        // Navigates to the specified URL and waits for the page to load.
        await page.goto(url);
        await page.waitForSelector(paginationPath);

        // Retrieves the total number of pages to scrape.
        const totalPages = await page.evaluate(
            /**
             * Retrieves the total number of pages from the pagination element.
             * @param {string} paginationPath - The CSS selector for the pagination element.
             * @returns {number} - The total number of pages to scrape.
             */
            ({ paginationPath }) => {
                const paginationElement =
                    document.querySelector(paginationPath);
                return paginationElement
                    ? Number(paginationElement.getAttribute("length"))
                    : 1;
            },
            { paginationPath }
        );

        // Logs the URL, number of pages to scrape, and separator.
        log(
            `
            #######################################################
            URL: ${url}
            Pages to scrape: ${totalPages}
            #######################################################
        `,
            false
        );

        // Array to store scraped products.
        let products = [];
        const nbPages = Math.min(numberOfPagesToScrape, totalPages);
        // Iterates over each page to scrape content.
        for (let i = 1; i <= nbPages; i++) {
            const currentPageProducts = await scrapePageContent(page, i);
            products.push(...currentPageProducts);
            // Navigates to the next page if not the last page.
            if (i < nbPages) {
                await navigateToNextPage(page, i);
            }
        }

        // Logs the total number of scraped products.
        log(
            `
            #######################################################
            Total scraped products: ${products.length}
            #######################################################
        `,
            false
        );

        // Saves scraped data to JSON, CSV, and optionally downloads images.
        await saveData(productType, products);
    } catch (error) {
        // Logs any errors that occur during scraping.
        console.error("Error while scraping:", error);
    } finally {
        // Closes the browser and exits the process.
        await browser.close();
        process.exit(1);
    }
})();

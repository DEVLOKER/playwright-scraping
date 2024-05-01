import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

/**
 * Saves data to a JSON file.
 * @param {string} filename - The path to the JSON file.
 * @param {Array} products - An array of products to save.
 */
export const saveToJsonFile = (filename, products) => {
    // Write the products array to the JSON file with formatted indentation.
    fs.writeFileSync(filename, JSON.stringify(products ?? [], null, 4), {
        encoding: "utf8",
        flag: "w",
    });
    // Close the file descriptor for standard error (stderr).
    fs.close(2);
    // Log a success message indicating the file has been written.
    log(`${filename} has been written successfully`);
};

/**
 * Saves data to a CSV file.
 * @param {string} filename - The path to the CSV file.
 * @param {Array} products - An array of products to save.
 */
export const saveToCsvFile = async (filename, products) => {
    // Define the headers for the CSV file.
    const csvWriter = createObjectCsvWriter({
        path: filename,
        header: [
            { id: "id", title: "ID" },
            { id: "img", title: "Image URL" },
            { id: "title", title: "Title" },
            { id: "price", title: "Price" },
            { id: "infos", title: "Infos" },
            { id: "others", title: "others" },
        ],
    });

    // Flatten and reformat the data for CSV format.
    const records = products.map((product) => {
        const { id, img, title, price, infos, state, timeAgo } = product;
        return {
            id,
            img,
            title,
            price: `${price.value} ${price.unit}`,
            infos: infos.join(", "),
            others: `${state} ${timeAgo}`,
        };
    });

    // Write the records to the CSV file.
    await csvWriter.writeRecords(records);
    // Log a success message indicating the file has been written.
    log(`${filename} has been written successfully`);
};

/**
 * Downloads images associated with products.
 * @param {string} destinationPath - The directory path to save the images.
 * @param {Array} products - An array of products containing image URLs.
 */
export const downloadImages = async (destinationPath, products) => {
    // Empty the destination directory to ensure clean storage.
    emptyDirectory(destinationPath);

    log(`downloading ${products.length} images ...`);

    // Iterate over each product to download its image.
    for (const product of products) {
        const { id, img: imageUrl } = product;
        const imagePath = path.join(destinationPath, `${id}.jpg`);

        // Check if the image URL is in base64 format.
        const regEx = /^data:image\/[a-z]+;base64,/;
        if (regEx.test(imageUrl)) {
            // Decode and write base64 image data to file.
            const base64Data = imageUrl.replace(regEx, "");
            fs.writeFileSync(imagePath, base64Data, "base64");
            continue;
        }

        // Download image from URL and save to file.
        const file = fs.createWriteStream(imagePath);
        const api = imageUrl.startsWith("https://") ? https : http;
        await new Promise((resolve, reject) => {
            api.get(new URL(imageUrl), (res) => resolve(res.pipe(file)));
        });
    }

    log(`download complete in ${destinationPath}.`);
};

/**
 * Empties a directory by deleting all its contents.
 * @param {string} directoryPath - The path to the directory to be emptied.
 */
export const emptyDirectory = (directoryPath) => {
    // Iterate over each file in the directory and delete it.
    for (const file of fs.readdirSync(directoryPath)) {
        fs.unlinkSync(path.join(directoryPath, file));
    }
};

/**
 * Logs a message with an optional timestamp.
 * @param {string} text - The text to be logged.
 * @param {boolean} includeTime - Whether to include a timestamp in the log message. Default is true.
 */
export const log = (text, includeTime = true) => {
    // Log the message with or without a timestamp based on the includeTime parameter.
    if (includeTime)
        console.log(`${new Date().toTimeString().split(" ")[0]} => ${text}`);
    else console.log(text);
};

const fs = require("fs-extra");
const util = require("util");
const csv = require("csv-parser");

const readFileAsync = util.promisify(fs.readFile);

async function readCSVFile(filePath) {
  try {
    const fileContent = await fs.promises.readFile(filePath, {
      encoding: "utf8",
    });

    const results = [];
    const csvData = await new Promise((resolve, reject) => {
      // Parse the CSV data from the file content
      const parser = csv();

      parser.on("data", (data) => {
        results.push(data);
      });

      parser.on("end", () => {
        resolve(results);
      });

      parser.on("error", (error) => {
        reject(error);
      });

      // Pipe the file content to the CSV parser
      const stream = require("stream");
      const readableStream = new stream.Readable();
      readableStream.push(fileContent);
      readableStream.push(null); // Signal the end of the stream

      readableStream.pipe(parser);
    });

    return csvData;
  } catch (error) {
    // Handle any errors that occur during file reading or parsing
    console.warn(error.message);
    return [];
  }
}

// convert an object to a csv string format
function convertToCSV(jsonData) {
  const header = Object.keys(jsonData[0]).join(",");
  const rows = jsonData.map((obj) => Object.values(obj).join(","));
  return header + "\n" + rows.join("\n");
}

// write an object to a csv file
function writeCSVFile(data, path) {
  if (data.length === 0) return;
  const csvData = convertToCSV(data);
  fs.writeFileSync(path, csvData);
}

module.exports = {
  readCSVFile,
  writeCSVFile,
};

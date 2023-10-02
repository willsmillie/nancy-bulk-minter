const fs = require("fs-extra");
const util = require("util");
const csv = require("csv-parser");

const readFileAsync = util.promisify(fs.readFile);

function readCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

// convert an object to a csv string format
function convertToCSV(jsonData) {
  const header = Object.keys(jsonData[0]).join(",");
  const rows = jsonData.map((obj) => Object.values(obj).join(","));
  return header + "\n" + rows.join("\n");
}

// write an object to a csv file
function writeCSVFile(data, path) {
  const csvData = convertToCSV(data);
  fs.writeFileSync(path, csvData);
}

module.exports = {
  readCSVFile,
  writeCSVFile,
};

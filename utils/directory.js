const os = require("os");
const fs = require("fs-extra");
const path = require("path");
const { prompt, Select, NumberPrompt, Toggle, Snippet } = require("enquirer");

async function promptPath(message) {
  const { directory } = await prompt({
    type: "input",
    name: "directory",
    message: message,
    validate(_value) {
      // Check if the path exists and is valid
      const value = resolveTildePath(_value);
      if (fs.existsSync(value)) {
        return true;
      }
      return "Please enter a valid file path.";
    },
  });

  return resolveTildePath(directory);
}

function resolveTildePath(inputPath) {
  if (inputPath.startsWith("~/")) {
    const homeDir = os.homedir();
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

// get an array of folders within the passed directory
async function foldersInDirectory(assetsDir) {
  const results = [];

  // Get the list of folders in the assets directory
  const folders = await fs.promises.readdir(assetsDir);

  for (const folder of folders) {
    const folderPath = path.join(assetsDir, folder);

    // Check if the folder is a directory
    const stats = await fs.promises.stat(folderPath);
    if (stats.isDirectory()) {
      results.push(folderPath);
    }
  }

  return results;
}

function idForPath(dir) {
  const regex = /(\d+)$/;
  const match = dir.match(regex);
  return match ? match[1] : null;
}

module.exports = {
  promptPath,
  resolveTildePath,
  foldersInDirectory,
  idForPath,
};

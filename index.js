require("dotenv").config();
const path = require("path");
const ora = require("ora");
const { prompt, Select, NumberPrompt, Toggle, Snippet } = require("enquirer");
const {
  muteBlock,
  readCSVFile,
  writeCSVFile,
  printHeader,
  promptPath,
  resolveTildePath,
  foldersInDirectory,
  filesInDirectory,
  authenticate,
  selectFee,
  selectCollection,
  mintNFTWithMetadataCID,
  metadataForNFTCID,
  generateNFTAttributes,
  pinFromJSON,
  pinFromFS,
  idForPath,
} = require("./utils");

const { CSV_FILE_PATH, NFT_ROYALTY, NFT_NAME } = process.env;

////////////////////////////
//           CLI          //
////////////////////////////

async function run() {
  printHeader();

  const prompt = new Select({
    name: "tool",
    message: "Pick a Tool",
    choices: [
      { message: "📌 Pin Directories/WebApps to Pinata", name: "pin" },
      { message: "🖼️ Pin Files to Pinata", name: "pinImgs" },
      { message: "🏭 Mint NFT Collection", name: "mint" },
    ],
  });

  await prompt
    .run()
    .then(async (answer) => {
      switch (answer) {
        case "pin":
          return await getDirToPin();
        case "pinImgs":
          return await getFilesToPin();
        case "mint":
          return await mintCollection();
      }
    })
    .catch(console.error);

  process.exit();
}

////////////////////////////
//          TOOLS         //
////////////////////////////

// Prompt the user for a specific path
async function getDirToPin() {
  const directory = await promptPath("Enter the path to your nfts");
  const files = await foldersInDirectory(resolveTildePath(directory));
  const proceed = new Toggle({
    message: `Pin ${files?.length || 0} folders to Pinata?`,
  });

  await proceed.run().then(async (shouldProceed) => {
    if (shouldProceed) await pinFoldersInDir(directory);
  });
}

// Prompt the user for a specific path
async function getFilesToPin() {
  const directory = await promptPath("Enter the path to your nft images");
  const files = await filesInDirectory(resolveTildePath(directory));
  const proceed = new Toggle({
    message: `Pin ${files?.length || 0} files to Pinata?`,
  });

  await proceed.run().then(async (shouldProceed) => {
    if (shouldProceed) await pinFilesInDir(directory);
  });
}

// Tool stepping thru steps to mint an NFT collection based on the pin-log.csv
async function mintCollection() {
  // First authenticate
  const spinner = ora("Authenticating with Loopring API...").start();

  const { accountId, owner, apiKey, eddsaKey, exchangeAddress } =
    await muteBlock(authenticate);

  accountId && apiKey
    ? spinner.succeed("Authentication Succeeded!\n")
    : spinner.fail("Authentication Failed!\n");
  spinner.stop();

  // now choose the collection to mint under
  const { counterFactualNftInfo, nftTokenAddress } = await selectCollection({
    apiKey,
    owner,
  });

  // then lets get the storage id
  let { fee, USD_COST } = await selectFee({
    accountId,
    apiKey,
    nftTokenAddress,
  });

  const { mintStatuses, pendingMintCids, pinLog } =
    await parsePendingMintCids();
  console.log(pinLog.map((e) => e.name));

  process.on("exit", (code) => {
    console.log(`Exiting with code ${code}`);
    writeCSVFile(mintStatuses, "./mint-log.csv");
    // Additional log messages or cleanup can be added here
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT (Ctrl+C)");
    writeCSVFile(mintStatuses, "./mint-log.csv");
    // Additional log messages or cleanup can be added here
    process.exit(0); // Exit with code 0 (success)
  });

  const proceed = new Toggle({
    message: `Mint ${pendingMintCids.length} NFTs? This will cost ~$${
      USD_COST * pendingMintCids.length
    }`,
  });

  const shouldProceed = await proceed.run();
  if (!shouldProceed) return;

  // Loop thru each metadata CID & mint it
  for (const cid of pendingMintCids) {
    const i = idForPath(pinLog.find((e) => e.metadata_cid === cid)?.name);
    const spinner = ora(`🏭 minting ${NFT_NAME} ${i}`).start();

    const params = {
      cid,
      apiKey,
      eddsaKey,
      owner,
      accountId,
      nftTokenAddress,
      exchangeAddress,
      counterFactualNftInfo,
      fee,
    };

    try {
      const mintResult = await mintNFTWithMetadataCID(params);
      mintStatuses.push({
        name: `${NFT_NAME} ${i}`,
        metadata_cid: cid,
        ...mintResult,
        status: "ok",
      });
      spinner.succeed(`✅ Minted ${NFT_NAME} ${i}`);
    } catch (error) {
      mintStatuses.push({
        name: `${NFT_NAME} ${i}`,
        metadata_cid: cid,
        ...error,
        status: "error",
      });
      spinner.fail(`❌ Error minting ${NFT_NAME} ${i}: ${error.message}`);

      break;
    }
  }

  process.exit();
}

////////////////////////////
//          UTILS         //
////////////////////////////

// Pin all files in a given directory to IPFS
async function pinFilesInDir(dir) {
  if (!dir)
    return console.error(
      "This program requires you to include a path to files to pin"
    );

  const { pinStatuses, pendingFiles } = await parsePendingFiles(dir);
  process.on("exit", (code) => {
    console.log(`Exiting with code ${code}`);
    writeCSVFile(pinStatuses, "./pin-log.csv");
    // Additional log messages or cleanup can be added here
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT (Ctrl+C)");
    writeCSVFile(pinStatuses, "./pin-log.csv");
    // Additional log messages or cleanup can be added here
    process.exit(0); // Exit with code 0 (success)
  });

  const completedIds = await readCSVFile(`./${CSV_FILE_PATH}`).then((data) =>
    data.filter((row) => row.MINTED.toLowerCase() === "yes").map((e) => e.ID)
  );

  for (const [i, filePath] of pendingFiles
    .filter((e) => e.includes(".webp"))
    .entries()) {
    const name = path.basename(filePath);
    const id = idForPath(name);

    if (completedIds.includes(id)) {
      console.log(`✍️ ${id} was minted by hand; skipping`);
      continue;
    }

    let spinner = ora(`📌 pinning ${name}\n`).start();

    const status = { name: name, path: filePath };

    let fileCid = null;
    try {
      const fileRes = await pinFromFS(filePath);
      fileCid = fileRes?.IpfsHash;
      status.file_cid = fileCid;
      status.file_status = "ok";
      spinner.succeed(`✅ pinned ${name}`);
    } catch (error) {
      status.file_status = "error";
      status.file_code = error.code;
      status.file_message = error.message;
      spinner.fail(
        `❌ Failed to pin ${name}: ${
          error.message ?? JSON.stringify(error, null, 2)
        }`
      );
      break;
    }

    const gifPath = filePath.replace("webp", "gif");
    const gifName = path.basename(gifPath);
    spinner = ora(`📌 pinning ${gifName}\n`).start();
    let thumbCid = null;
    try {
      const fileRes = await pinFromFS(gifPath);
      thumbCid = fileRes?.IpfsHash;
      status.thumb_cid = thumbCid;
      status.thumb_path = gifName;
      status.thumb_status = "ok";
      spinner.succeed(`✅ pinned ${gifName}`);
    } catch (error) {
      status.thumb_status = "error";
      status.thumb_code = error.code;
      status.thumb_path = gifName;
      status.thumb_message = error.message;
      spinner.fail(
        `❌ Failed to pin ${gifPath} thumbnail: ${
          error.message ?? JSON.stringify(error, null, 2)
        }`
      );
      break;
    }

    let metadataCid = null;
    spinner = ora(`📌 pinning ${id} metadata\n`).start();
    try {
      const row = await readCSVFile(`./${CSV_FILE_PATH}`).then((data) => {
        return data.find((row) => row.ID === id);
      });
      const metadata = metadataForNFTCID(row, fileCid, thumbCid);
      const metaRes = await pinFromJSON(metadata);

      metadataCid = metaRes?.IpfsHash;
      status.metadata_cid = metadataCid;
      status.metadata_status = "ok";
      spinner.succeed(`✅ pinned ${name} metadata`);
    } catch (error) {
      status.metadata_status = "error";
      status.metadata_code = error.code;
      status.metadata_message = error.message;
      spinner.fail(
        `❌ Failed to pin ${name} metadata: ${
          error.message ?? JSON.stringify(error, null, 2)
        }`
      );

      break;
    }

    spinner.stop();
    pinStatuses.push(status);
  }

  writeCSVFile(pinStatuses, "./pin-log.csv");
}

// Determine the files which still need to be uploaded / pinned to IPFS
async function parsePendingFiles(dir) {
  const fileNames = await filesInDirectory(dir);

  // sorting function to sort paths numerically
  fileNames.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)[0]); // Extract and parse the numeric part
    const numB = parseInt(b.match(/\d+/)[0]);
    return numA - numB; // Compare the numeric values
  });

  const pinLogData = await readCSVFile("./pin-log.csv").catch(() => []);
  const pinStatuses = [...pinLogData];

  // Read and parse the pin-log.csv file to get the processed files.
  let processedFiles = pinLogData
    .filter((row) => row.file_status === "ok")
    .map((row) => row.path);

  // Identify pending files by comparing with the original file names
  const pendingFiles = fileNames.filter(
    (fileName) => !processedFiles.includes(fileName)
  );

  console.log(
    `✴️\t${pendingFiles.length} are pending\n✅\t${processedFiles.length} have already been pinned`
  );

  return { pinStatuses, pendingFiles };
}

// Pin all folders in a given directory to IPFS
async function pinFoldersInDir(dir) {
  if (!dir)
    return console.error(
      'Nancy says "This program requires you include a path to NFTs to mint"'
    );

  const { pinStatuses, pendingPaths } = await parsePendingPaths(dir);
  process.on("exit", (code) => {
    console.log(`Exiting with code ${code}`);
    writeCSVFile(pinStatuses, "./pin-log.csv");
    // Additional log messages or cleanup can be added here
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT (Ctrl+C)");
    writeCSVFile(pinStatuses, "./pin-log.csv");
    // Additional log messages or cleanup can be added here
    process.exit(0); // Exit with code 0 (success)
  });

  for (const [i, nftPath] of pendingPaths.entries()) {
    const name = path.basename(nftPath);
    const spinner = ora(`📌 pinning ${name} (content & metadata)\n`).start();

    const status = { name: `${NFT_NAME} ${name}`, path: name };

    let folderCid = null;
    try {
      const folderRes = await pinFromFS(nftPath);
      folderCid = folderRes?.IpfsHash;
      status.content_cid = folderCid;
      status.content_status = "ok";
      spinner.succeed(`✅ pinned ${name} content`);
    } catch (error) {
      status.content_status = "error";
      status.content_code = error.code;
      status.content_message = error.message;
      spinner.fail(
        `❌ Failed to pin ${name} content: ${
          error.message ?? JSON.stringify(error, null, 2)
        }`
      );
      break;
    }

    let metadataCid = null;
    try {
      const id = idForPath(nftPath);
      const row = await readCSVFile(`./${CSV_FILE_PATH}`).then((data) => {
        return data.find((row) => row.ID === id);
      });
      const metadata = metadataForNFTCID(row, folderCid);
      const metaRes = await pinFromJSON(metadata);

      metadataCid = metaRes?.IpfsHash;
      status.metadata_cid = metadataCid;
      status.metadata_status = "ok";
      spinner.succeed(`✅ pinned ${name} metadata`);
    } catch (error) {
      status.metadata_status = "error";
      status.metadata_code = error.code;
      status.metadata_message = error.message;
      spinner.fail(
        `❌ Failed to pin ${name} metadata: ${
          error.message ?? JSON.stringify(error, null, 2)
        }`
      );

      break;
    }

    spinner.stop();
    pinStatuses.push(status);
  }

  writeCSVFile(pinStatuses, "./pin-log.csv");
}

// Determine the directories which still need to be uploaded / pinned to IPFS
async function parsePendingPaths(dir) {
  const nftPaths = await foldersInDirectory(dir);

  const pinLogData = await readCSVFile("./pin-log.csv").catch(() => []);
  const pinStatuses = [...pinLogData];

  // sorting function to sort paths numerically
  nftPaths.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)[0]); // Extract and parse the numeric part
    const numB = parseInt(b.match(/\d+/)[0]);
    return numA - numB; // Compare the numeric values
  });

  // Read and parse the pin-log.csv file to get the processed paths.
  let processedPaths = pinLogData
    .filter(
      (row) => row.content_status === "ok" && row.metadata_status === "ok"
    )
    .map((row) => row.path);

  // Extract the numeric part from each processed path
  const numericProcessedPaths = processedPaths.map(
    (path) => path.match(/\d+/)[0]
  );

  // Identify pending paths by comparing with the original paths
  const pendingPaths = nftPaths.filter((path) => {
    const numericPath = path.match(/\d+/)[0];
    return !numericProcessedPaths.includes(numericPath);
  });

  console.log(
    `✴️\t${pendingPaths.length} are pending\n✅\t${processedPaths.length} have already been pinned`
  );

  return { pinStatuses, pendingPaths };
}

// Determine the nfts which still need to be minted
async function parsePendingMintCids() {
  const pinLog = await readCSVFile("./pin-log.csv").catch((e) => {
    console.warn(e.message);
    return [];
  });

  const mintLog = await readCSVFile("./mint-log.csv").catch((e) => {
    console.warn(e.message);
    return [];
  });

  const mintStatuses = [...mintLog];

  // sorting function to sort paths numerically
  pinLog.sort((a, b) => {
    const numA = parseInt(idForPath(a.name)); // Ensure a default value for non-numeric cases
    const numB = parseInt(idForPath(b.name));
    return numA - numB; // Compare the numeric values
  });

  const metadataCids = pinLog.map((e) => e.metadata_cid);

  const processedMints = mintLog.map((e) => e.metadata_cid);

  // Identify pending paths by comparing with the original paths
  const pendingMintCids = metadataCids.filter((metadataCid) => {
    return !processedMints.includes(metadataCid);
  });

  return { mintStatuses, pendingMintCids, pinLog };
}

run();

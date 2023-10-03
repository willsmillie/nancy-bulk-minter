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
      { message: "🏭 Mint NFT Collection", name: "mint" },
    ],
  });

  await prompt
    .run()
    .then(async (answer) => {
      switch (answer) {
        case "pin":
          return await getDirToPin();

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

  const proceed = new Toggle({
    message: `Mint ${pendingMintCids.length} NFTs? This will cost ~$${
      USD_COST * pendingMintCids.length
    }`,
  });

  const shouldProceed = await proceed.run();
  if (!shouldProceed) return;

  // Loop thru each metadata CID & mint it
  for (const cid of pendingMintCids) {
    const i = pinLog.find((e) => e.metadata_cid === cid)?.path;
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

      // break;
    }
  }

  writeCSVFile(mintStatuses, "mint-log.csv");

  process.exit();
}

////////////////////////////
//          UTILS         //
////////////////////////////

// Pin all folders in a given directory to IPFS
async function pinFoldersInDir(dir) {
  if (!dir)
    return console.error(
      'Nancy says "This program requires you include a path to NFTs to mint"'
    );

  const { pinStatuses, pendingPaths } = await parsePendingPaths(dir);

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
    const numA = parseInt(a.path.match(/\d+/)[0]); // Extract and parse the numeric part
    const numB = parseInt(b.path.match(/\d+/)[0]);
    return numA - numB; // Compare the numeric values
  });

  const metadataCids = pinLog.map((e) => e.metadata_cid);

  const mintLog = await readCSVFile("./mint-log.csv").catch((e) => {
    console.warn(e.message);
    return [];
  });
  const processedMints = mintLog.map((e) => e.metadata_cid);

  // Identify pending paths by comparing with the original paths
  const pendingMintCids = metadataCids.filter((metadataCid) => {
    return !processedMints.includes(metadataCid);
  });

  return { mintStatuses, pendingMintCids, pinLog };
}

run();

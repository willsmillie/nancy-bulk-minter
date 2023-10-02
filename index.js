require("dotenv").config();
const os = require("os");
const fs = require("fs-extra");
const path = require("path");
const csv = require("csv-parser");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const Web3 = require("web3");
const sdk = require("@loopring-web/loopring-sdk");
const { prompt, Select, NumberPrompt, Toggle, Snippet } = require("enquirer");
const ora = require("ora");
require("console.mute"); // used for the ability to silence some of Loopring's logs

// Use the api keys by providing the strings directly
const pinataSDK = require("@pinata/sdk");

const {
  PINATA_API_SECRET,
  PINATA_API_KEY,
  CSV_FILE_PATH,
  NFT_ROYALTY,
  NFT_NAME,
  NFT_ARTIST,
  NFT_THUMBNAIL,
  NFT_DESCRIPTION,
  NFT_COLLECTION,
  CHAIN_ID,
  INFURA_PROJECT_ID,
  ETH_ACCOUNT_ADDRESS,
  ETH_ACCOUNT_PRIVATE_KEY,
} = process.env;

// initialize pinata IPFS sdk with keys
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_API_SECRET);

// initialize ETH provider via infura & private key
const provider = new PrivateKeyProvider(
  ETH_ACCOUNT_PRIVATE_KEY,
  `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`
);

// create an instance of web3
const web3 = new Web3(provider);
const exchangeAPI = new sdk.ExchangeAPI({ chainId: CHAIN_ID });
const userAPI = new sdk.UserAPI({ chainId: CHAIN_ID });
const walletAPI = new sdk.WalletAPI({ chainId: CHAIN_ID });
const nftAPI = new sdk.NFTAPI({ chainId: CHAIN_ID });

const logo = `
                  .........:..                    
                ....:::~^?77!^^^^^^^::..          
               ..  .^~:~:::.     ....:^^^^.       
                 :~^. ..:.:            ..:^~^.    
               .~^.   :....             ....:~~^. 
              :!.     .:..                .....^!^
             ^~                            ......:
           :!:                             .......
         :~^.                      ......    .....
   ..  :~^.                   ....~~~^::^.     ...
 .~^^~~^...^:.....:.          :..::..::. ..     ..
 7^:~!. .. ?J. ...:.          ...    ~5.  ..    ..
 ?:7^  ::........     .....       ..........     .
 ^Y^   .              ....:.                      
 .?                                               
 ~^                                              .
 7.                                              .
 7.                                               
 7.                                              .
 7.                 .........                   ..
 ~^                 ........                   ...
 .7                                            ...
  7.                                          ....
  ^~                                         .....
           
  \tNANCY COMMAND LINE INTERFACE
`;

////////////////////////////
//           CLI          //
////////////////////////////

async function run() {
  console.info(`%c${logo}`, "color: #fee6ba");

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

  const metadataCids = await mapMetadataCidValues("pin-log.csv");

  const proceed = new Toggle({
    message: `Mint ${metadataCids.length} NFTs? This will cost ~$${
      USD_COST * metadataCids.length
    }`,
  });

  const shouldProceed = await proceed.run();
  if (!shouldProceed) return;

  const results = [];
  // Loop thru each metadata CID & mint it
  for (const [i, cid] of metadataCids.entries()) {
    const spinner = ora(`🏭 minting ${NFT_NAME} ${i}`).start();

    try {
      const mintResult = await mintNFTWithMetadataCID({
        cid,
        apiKey,
        eddsaKey,
        owner,
        accountId,
        nftTokenAddress,
        exchangeAddress,
        counterFactualNftInfo,
        fee,
      });
      results.push({ name: `${NFT_NAME} ${i}`, ...mintResult, status: "ok" });
      spinner.succeed(`✅ Minted ${NFT_NAME} ${i}`);
    } catch (error) {
      results.push({ name: `${NFT_NAME} ${i}`, ...error, status: "error" });
      spinner.fail(`❌ Error minting ${NFT_NAME} ${i}: ${error.message}`);
    }
  }

  const csvData = convertToCSV(results);
  fs.writeFileSync("mint-log.csv", csvData);

  process.exit();
}

function mapMetadataCidValues(csvFileName) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(csvFileName)
      .pipe(csv())
      .on("data", (data) => {
        // Assuming 'metadata_cid' is a column in your CSV
        const metadataCid = data.metadata_cid;
        results.push(metadataCid);
      })
      .on("end", () => {
        // At this point, 'results' will contain an array of 'metadata_cid' values
        resolve(results);
      })
      .on("error", (error) => {
        // Handle any errors that occur during file read or CSV parsing
        reject(error);
      });
  });
}

function convertToCSV(jsonData) {
  const header = Object.keys(jsonData[0]).join(",");
  const rows = jsonData.map((obj) => Object.values(obj).join(","));
  return header + "\n" + rows.join("\n");
}

// mute extraneous logs
async function muteBlock(callback) {
  console.mute();
  const res = await callback();
  console.resume();
  return res;
}

async function pinFoldersInDir(dir) {
  // const args = process.argv.slice(2);

  // const dir = args[0];
  if (!dir)
    return console.error(
      'Nancy says "This program requires you include a path to NFTs to mint"'
    );

  const nftPaths = await foldersInDirectory(dir);

  const pinStatuses = [];

  for (const [i, nftPath] of nftPaths.entries()) {
    const name = nameForDir(nftPath);
    const spinner = ora(`📌 pinning ${name} (content & metadata)\n`).start();

    const status = { name: `${NFT_NAME} ${i}`, path: name };

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
      spinner.fail(`❌ Failed to pin ${name} content: ${error.message}`);
      console.log(error);
      process.exit();
    }

    let metadataCid = null;
    try {
      const id = idForPath(nftPath);
      const row = await getRowById(id);
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
      spinner.fail(`❌ Failed to pin ${name} metadata: ${error.message}`);
      console.log(error);

      process.exit();
    }

    spinner.stop();
    pinStatuses.push(status);
  }

  const csvData = convertToCSV(pinStatuses);
  fs.writeFileSync("pin-log.csv", csvData);
}

////////////////////////////
//          UTILS         //
////////////////////////////

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

function nameForDir(dir) {
  // Find the last occurrence of "/" in the path
  const lastIndex = dir.lastIndexOf("/");

  // Use slice to extract the part after the last "/"
  return dir.slice(lastIndex + 1);
}

// Pin directory to IPFS via pinata
async function pinFromFS(dir) {
  const name = nameForDir(dir);

  const options = {
    pinataMetadata: {
      name: `${NFT_NAME}-${name}-webapp`,
    },
    pinataOptions: {
      cidVersion: 0,
    },
  };

  return await pinata.pinFromFS(dir, options);
}

// Pin directory to IPFS via pinata
async function pinFromJSON(obj) {
  const options = {
    pinataMetadata: {
      name: `${obj.name}-metadata`,
    },
    pinataOptions: {
      cidVersion: 0,
    },
  };

  return await pinata.pinJSONToIPFS(obj, options);
}

// Get metadata from the CSV file defined in the .env file
function getRowById(idToFind) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(`./${CSV_FILE_PATH}`)
      .pipe(csv())
      .on("data", (row) => {
        results.push(row);
      })
      .on("end", () => {
        const foundRow = results.find((row) => row.ID === idToFind);

        if (foundRow) {
          resolve(foundRow);
        } else {
          reject(new Error(`Row with ID ${idToFind} not found`));
        }
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

function idForPath(dir) {
  const regex = /(\d+)$/;
  const match = dir.match(regex);
  return match ? match[1] : null;
}

function metadataForNFTCID(NFT, CID) {
  return {
    description: NFT_DESCRIPTION, // describe nft
    image: `ipfs://${CID}/${NFT_THUMBNAIL}`, // thumbnail is subpath of the uploaded folter
    animation_url: `ipfs://${CID}`, // interactive nft param
    name: `PXL NANCY ${NFT.ID}`, // name of the NFT
    royalty_percentage: Number(NFT_ROYALTY),
    collection_metadata: NFT_COLLECTION,
    ...generateNFTAttributes(NFT),
  };
}

function generateNFTAttributes(nftProperties) {
  const keys = [
    "ID",
    "BACKGROUND",
    "BODY",
    "TATTOO",
    "FACE",
    "SHIRT",
    "JACKET",
    "EYES",
    "HEAD",
  ];

  const attributes = [];
  const properties = {};

  // Populate the attributes array based on the keys
  for (const key of keys) {
    attributes.push({
      trait_type: key,
      value: nftProperties[key],
    });

    properties[key] = nftProperties[key];
  }

  return { properties, attributes };
}

////////////////////////////////
// AUTHENTICATE WITH LOOPRING //
////////////////////////////////

const signatureKeyPairMock = async (accInfo, exchangeAddress) => {
  const keySeed =
    accInfo.keySeed ||
    sdk.GlobalAPI.KEY_MESSAGE.replace(
      "${exchangeAddress}",
      exchangeAddress
    ).replace("${nonce}", (accInfo.nonce - 1).toString());
  const eddsaKey = await sdk.generateKeyPair({
    web3,
    address: accInfo.owner,
    keySeed,
    walletType: sdk.ConnectorNames.Unknown,
    chainId: parseInt(CHAIN_ID, 10),
  });

  return eddsaKey;
};

// Authenticate the account defined in your .env file
const authenticate = async () => {
  try {
    // get info from chain / init of LoopringAPI contains process.env.CHAIN_ID
    const { exchangeInfo } = await exchangeAPI.getExchangeInfo();
    // exchange address can change over time
    const { exchangeAddress } = exchangeInfo;

    // Get the accountId and other metadata needed for sig
    const { accInfo } = await exchangeAPI.getAccount({
      owner: ETH_ACCOUNT_ADDRESS,
    });
    const { accountId } = accInfo;

    // Auth to API via signature
    const eddsaKey = await signatureKeyPairMock(accInfo, exchangeAddress);
    const { apiKey } = await userAPI.getUserApiKey({ accountId }, eddsaKey.sk);
    return { ...accInfo, apiKey, eddsaKey, exchangeAddress };
  } catch (error) {
    console.error(error);
    return;
  }
};

// Get Fees
const selectFee = async ({ accountId, apiKey, nftTokenAddress }) => {
  // get fees to make sure we can afford this
  const { fees } = await userAPI.getNFTOffchainFeeAmt(
    {
      accountId: accountId,
      requestType: sdk.OffchainNFTFeeReqType.NFT_MINT,
      tokenAddress: nftTokenAddress,
    },
    apiKey
  );

  const USD_COST = parseInt((fees["USDC"] || fees["USDT"]).fee, 10) / 1e6;
  const feeOptions = new Select({
    name: "fee",
    message: `Pick a fee option USD ~$${USD_COST}`,
    choices: Object.entries(fees)
      .filter(([k]) => /ETH|LRC/.test(k))
      .map(([k]) => k),
  });

  const selectedFee = await feeOptions.run();
  return { fee: fees[selectedFee], USD_COST };
};

// select a collection for which to mint an NFT within
async function selectCollection({ apiKey, owner }) {
  try {
    const collectionRes = await userAPI.getUserOwenCollection(
      {
        owner: owner,
        isMintable: true,
      },
      apiKey
    );

    if (
      (collectionRes && (collectionRes.code || collectionRes.message)) ||
      !collectionRes.collections.length
    ) {
      console.log("Collection is disable to mint ");
      throw "Collection is disable to mint ";
    }

    const collectionOptions = new Select({
      name: "collection",
      message: `Select the collection to mint NFTs within`,
      choices: (collectionRes.collections ?? []).map((k, i) => ({
        name: k.name,
        value: k,
      })),
    });

    const selectedCollection = await collectionOptions.run();
    const collectionMeta = collectionRes.collections.find(
      (e) => e.name === selectedCollection
    );

    const counterFactualNftInfo = {
      nftOwner: owner,
      nftFactory:
        collectionMeta.nftFactory ??
        sdk.NFTFactory_Collection[sdk.ChainId.GOERLI],
      nftBaseUri: collectionMeta.baseUri,
    };
    const nftTokenAddress = collectionMeta.contractAddress;
    return { counterFactualNftInfo, nftTokenAddress };
  } catch (error) {
    throw error.message;
  }
}

async function mintNFTWithMetadataCID({
  cid,
  apiKey,
  eddsaKey,
  owner,
  accountId,
  nftTokenAddress,
  exchangeAddress,
  counterFactualNftInfo,
  fee,
}) {
  const storageId = await muteBlock(async () =>
    userAPI.getNextStorageId(
      { accountId: accountId, sellTokenId: fee.tokenId },
      apiKey
    )
  );

  const nftId = nftAPI.ipfsCid0ToNftID(cid);

  const request = {
    exchange: exchangeAddress,
    minterId: accountId,
    minterAddress: owner,
    toAccountId: accountId,
    toAddress: owner,
    nftType: 0,
    tokenAddress: nftTokenAddress,
    nftId: nftId,
    amount: 1,
    validUntil: Math.round(Date.now() / 1000) + 30 * 86400,
    storageId: storageId.offchainId,
    maxFee: {
      tokenId: fee.tokenId,
      amount: fee.fee,
    },
    royaltyPercentage: 10,
    counterFactualNftInfo,
    forceToMint: false,
  };

  const response = await muteBlock(() =>
    userAPI.submitNFTMint({
      request,
      web3,
      chainId: parseInt(CHAIN_ID, 10),
      walletType: sdk.ConnectorNames.Unknown,
      eddsaKey: eddsaKey.sk,
      apiKey: apiKey,
    })
  );

  if (!response.nftTokenId) throw response;
  return response;
}

run();

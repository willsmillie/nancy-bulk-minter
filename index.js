require("dotenv").config();
const fs = require("fs-extra");
const path = require("path");
const csv = require("csv-parser");
const { Select, NumberPrompt } = require("enquirer");
const ora = require("ora");
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
} = process.env;

const pinata = new pinataSDK(PINATA_API_KEY, PINATA_API_SECRET);
const csvFilePath = CSV_FILE_PATH;

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

async function run() {
  console.info(`%c${logo}`, "color: #fee6ba");
  const args = process.argv.slice(2);

  const dir = args[0];
  if (!dir)
    return console.error(
      'Nancy says "This program requires you include a path to NFTs to mint"'
    );

  const nftPaths = await foldersInDirectory(dir);

  const pinStatuses = [];

  for (const nftPath of nftPaths) {
    // const name = path.basename(nftPath);
    // const res = await pinFromFS(nftPath);
    const row = await getRowById(csvFilePath, nftPath);
    const metadata = metadataForNFTCID(row, res.IpfsHash);
    pinStatuses.push(res);
  }

  console.log(pinStatuses);
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

// Pin directory to IPFS via pinata
async function pinFromFS(dir) {
  const name = path.basename(dir);

  const spinner = ora(`📌 pinning ${name}\n`).start();

  const options = {
    pinataMetadata: {
      name: name,
    },
    pinataOptions: {
      cidVersion: 0,
    },
  };

  const res = await pinata.pinFromFS(dir, options);

  spinner.succeed(`✅ pinned ${name}`);

  return res;
}

// Get metadata from the CSV file defined in the .env file
function getRowById(filePath, idToFind) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
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

function metadataForNFTCID(NFT, CID) {
  return {
    description: NFT_DESCRIPTION, // describe nft
    image: `ipfs://${CID}/${NFT_THUMBNAIL}`, // thumbnail is subpath of the uploaded folter
    animation_url: `ipfs://${CID}`, // interactive nft param
    name: NFT_NAME, // name of the NFT
    artist: NFT_ARTIST, // creator of the NFT
    royalty_percentage: NFT_ROYALTY,
    collection_metadata: NFT_COLLECTION,
  };
}

run();

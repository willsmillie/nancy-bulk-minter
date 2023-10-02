const path = require("path");
const pinataSDK = require("@pinata/sdk");

// ENV vars
const {
  PINATA_API_KEY,
  PINATA_API_SECRET,
  NFT_ROYALTY,
  NFT_NAME,
  NFT_THUMBNAIL,
  NFT_DESCRIPTION,
  NFT_COLLECTION,
} = process.env;

// initialize pinata IPFS sdk with keys
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_API_SECRET);

// generate metadata for a specific NFT
function metadataForNFTCID(NFT, CID) {
  return {
    description: NFT_DESCRIPTION, // describe nft
    image: `ipfs://${CID}/${NFT_THUMBNAIL}`, // thumbnail is subpath of the uploaded folter
    animation_url: `ipfs://${CID}`, // interactive nft param
    name: `${NFT_NAME} ${NFT.ID}`, // name of the NFT
    royalty_percentage: Number(NFT_ROYALTY),
    collection_metadata: NFT_COLLECTION,
    ...generateNFTAttributes(NFT),
  };
}

// assemble attributes for a specific NFT
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

// Pin directory to IPFS via pinata
async function pinFromFS(dir) {
  const name = path.basename(dir);

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

module.exports = {
  metadataForNFTCID,
  generateNFTAttributes,
  pinFromJSON,
  pinFromFS,
};

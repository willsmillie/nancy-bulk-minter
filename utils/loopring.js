const PrivateKeyProvider = require("truffle-privatekey-provider");
const Web3 = require("web3");
const sdk = require("@loopring-web/loopring-sdk");
const { prompt, Select, NumberPrompt, Toggle, Snippet } = require("enquirer");
const { muteBlock } = require("./log");

// ENV vars
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
  CHAIN_ID: _CHAIN_ID,
  INFURA_PROJECT_ID,
  ETH_ACCOUNT_ADDRESS,
  ETH_ACCOUNT_PRIVATE_KEY,
} = process.env;

const CHAIN_ID = Number(_CHAIN_ID);

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

module.exports = {
  authenticate,
  selectFee,
  selectCollection,
  mintNFTWithMetadataCID,
};

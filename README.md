# Nancy Bulk NFT Minter CLI

```
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
           
        NANCY COMMAND LINE INTERFACE
             BULK PIN & MINTER
```
## Description
The Nancy Bulk NFT Minter CLI is a powerful tool for efficiently managing and minting NFTs (Non-Fungible Tokens) on the Ethereum blockchain. It simplifies the process of pinning directories/web apps to Pinata, a leading IPFS (InterPlanetary File System) hosting service, and minting NFT collections. This CLI tool streamlines the bulk upload/pinning & minting process via Loopring & Pinata.

## Installation

To get started with the Nancy Bulk NFT Minter CLI, follow these steps:

1. Clone the repository from GitHub:
```git clone https://github.com/willsmillie/nancy-bulk-minter.git```

2. Navigate to the project directory:
`cd nancy-bulk-minter`

3. Install the required dependencies using npm:
`npm install`

4. Start the CLI:
`npm start`


## Tools within the CLI

### Pin
- Use the pin tool to pin directories or web apps to Pinata. This ensures your content is available on IPFS, a decentralized file system.
### Mint
- The mint tool allows you to mint NFT collections on the Loopring network. It simplifies the process of creating and managing unique digital assets on the Ethereum blockchain.

## Setup Process

Before using the Nancy Bulk NFT Minter CLI, you need to set up the following:

1. Export Private Key: Export the private key from your Ethereum/Loopring wallet. This key is used to sign transactions during the minting process.
2. Pinata IPFS Account: Sign up for a Pinata IPFS account (https://pinata.cloud/) and obtain your API keys.
3. Infura Project ID: Get an Infura Project ID (https://infura.io/) to access Ethereum's infrastructure.
4. Ethereum Account Address: Provide your Ethereum account address, which is used for minting NFTs.
5. Customize NFT Metadata: Edit the .env file to customize the generated NFT metadata. You can set various properties like the NFT name, royalty, description, thumbnail, collection URL, and more.
6. Chain ID: Set the chain ID to specify the Ethereum network you want to use (e.g., 1 for mainnet).

## Configuration (In .env File)

```
# Infura Gateway
INFURA_PROJECT_ID=

# IPFS KEYS
PINATA_API_KEY=
PINATA_API_SECRET=

# PRIVATE KEY
ETH_ACCOUNT_PRIVATE_KEY=
ETH_ACCOUNT_ADDRESS=
CHAIN_ID=1 # 5 = goerli, 1 = mainnet (homestead)

# METADATA FOR NFT
NFT_ROYALTY=10
NFT_NAME=PXL NANCY
NFT_THUMBNAIL=apple-touch-icon-1024x1024.png # Subpath of the image within the webapp folder
NFT_DESCRIPTION=8BITS AND DRIP - ALBUM & GENERATIVE PXL NANCY INTERACTIVE WEB APP
NFT_COLLECTION=https://nftinfos.loopring.io/0x22b0c642e2964dddfe0011f8795c15c83dcca9c0

# DERIVE PROPERTIES FROM THE LOG
CSV_FILE_PATH=Metadatacombined_log.csv

```
Make sure to fill in the necessary details in the .env file according to your project requirements.

Now you're ready to use the Nancy Bulk NFT Minter CLI to efficiently manage and mint your NFT collections. Enjoy!


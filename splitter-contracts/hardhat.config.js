import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";

const { PRIVATE_KEY, ALCHEMY_KEY } = process.env;

export default {
  solidity: "0.8.20",
  networks: {
    amoy: {
      url: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_KEY || 'demo'}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY || 'demo'}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 137
    }
  }
};

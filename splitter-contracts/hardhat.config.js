import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";

const { PRIVATE_KEY, ALCHEMY_KEY } = process.env;

export default {
  solidity: "0.8.20",
  networks: {
    amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002
    },
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 137
    }
  }
};

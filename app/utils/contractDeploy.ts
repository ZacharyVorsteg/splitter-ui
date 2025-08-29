import { ethers } from 'ethers';

// Factory contract ABI
const FACTORY_ABI = [
  "function createSplitter(string memory name, address[] memory payees, uint256[] memory shares) external returns (address)",
  "event SplitterDeployed(address indexed splitter, address indexed owner, string name, address[] payees, uint256[] shares)",
  "function getOwnerSplitters(address owner) external view returns (tuple(address splitter, address owner, string name, address[] payees, uint256[] shares, uint256 createdAt)[])",
  "function releaseAll(address splitter, address[] calldata payees) external",
  "function releaseAllERC20(address splitter, address token, address[] calldata payees) external",
  "function releasableNative(address splitter, address account) external view returns (uint256)",
  "function getSplitterBalance(address splitter) external view returns (uint256)"
];

// Factory addresses (will be populated after deployment)
const FACTORY_ADDRESSES = {
  polygon: "0x0000000000000000000000000000000000000000", // To be updated after deployment
  ethereum: "0x0000000000000000000000000000000000000000",
  arbitrum: "0x0000000000000000000000000000000000000000",
  amoy: "0x0000000000000000000000000000000000000000", // Testnet
};

export interface SplitterConfig {
  name: string;
  network: 'Polygon' | 'Ethereum' | 'Arbitrum';
  token: 'ETH' | 'USDC';
  recipients: Array<{
    address: string;
    percent: number;
    bps: number;
  }>;
}

export interface DeployResult {
  splitterAddress: string;
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
  gasCostEth: string;
  gasCostUsd: string;
}

export class ContractDeployer {
  private provider: ethers.BrowserProvider;
  private signer: ethers.Signer | null = null;

  constructor() {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
    }
    
    this.provider = new ethers.BrowserProvider(window.ethereum);
  }

  async connect(): Promise<string> {
    const accounts = await this.provider.send('eth_requestAccounts', []);
    this.signer = await this.provider.getSigner();
    return accounts[0];
  }

  async deployFromConfig(config: SplitterConfig, ethPriceUsd: number): Promise<DeployResult> {
    if (!this.signer) {
      await this.connect();
    }

    if (!this.signer) {
      throw new Error('Failed to connect wallet');
    }

    const network = config.network.toLowerCase() as keyof typeof FACTORY_ADDRESSES;
    const factoryAddress = FACTORY_ADDRESSES[network];
    
    if (!factoryAddress || factoryAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Factory not deployed on ${config.network}. Please deploy factory first.`);
    }

    // Validate config
    if (!config.recipients || config.recipients.length === 0) {
      throw new Error('No recipients specified');
    }

    const totalPercent = config.recipients.reduce((sum, r) => sum + r.percent, 0);
    if (Math.abs(totalPercent - 100) > 0.001) {
      throw new Error(`Total percentage must equal 100%, got ${totalPercent}%`);
    }

    // Prepare contract call
    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.signer);
    
    const payees = config.recipients.map(r => r.address);
    const shares = config.recipients.map(r => r.bps); // Use basis points

    console.log('🚀 Deploying splitter contract...');
    console.log('Name:', config.name);
    console.log('Payees:', payees);
    console.log('Shares (BPS):', shares);

    // Estimate gas first
    const gasEstimate = await factory.createSplitter.estimateGas(config.name, payees, shares);
    console.log('Gas estimate:', gasEstimate.toString());

    // Deploy the splitter
    const tx = await factory.createSplitter(config.name, payees, shares);
    console.log('Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed in block:', receipt.blockNumber);

    // Parse the event to get splitter address
    let splitterAddress = '';
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed && parsed.name === 'SplitterDeployed') {
          splitterAddress = parsed.args.splitter;
          break;
        }
      } catch (error) {
        // Skip unparseable logs
      }
    }

    if (!splitterAddress) {
      throw new Error('Failed to parse splitter address from transaction logs');
    }

    // Calculate gas costs
    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice;
    const gasCostWei = gasUsed * effectiveGasPrice;
    const gasCostEth = ethers.formatEther(gasCostWei);
    const gasCostUsd = (parseFloat(gasCostEth) * ethPriceUsd).toFixed(4);

    const result: DeployResult = {
      splitterAddress,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: gasUsed.toString(),
      gasCostEth,
      gasCostUsd,
    };

    console.log('🎉 Deployment successful:', result);
    return result;
  }

  async fundSplitter(splitterAddress: string, amountEth: string): Promise<string> {
    if (!this.signer) {
      await this.connect();
    }

    if (!this.signer) {
      throw new Error('Failed to connect wallet');
    }

    console.log(`💰 Funding splitter ${splitterAddress} with ${amountEth} ETH/MATIC...`);

    const tx = await this.signer.sendTransaction({
      to: splitterAddress,
      value: ethers.parseEther(amountEth)
    });

    const receipt = await tx.wait();
    console.log('✅ Funding successful:', tx.hash);
    
    return tx.hash;
  }

  async releaseAll(splitterAddress: string, payees: string[]): Promise<string> {
    if (!this.signer) {
      await this.connect();
    }

    if (!this.signer) {
      throw new Error('Failed to connect wallet');
    }

    const network = (await this.provider.getNetwork()).name as keyof typeof FACTORY_ADDRESSES;
    const factoryAddress = FACTORY_ADDRESSES[network];
    
    if (!factoryAddress) {
      throw new Error(`Factory not available on ${network}`);
    }

    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.signer);
    
    console.log(`💸 Releasing funds to all payees for splitter ${splitterAddress}...`);

    const tx = await factory.releaseAll(splitterAddress, payees);
    const receipt = await tx.wait();
    
    console.log('✅ Release successful:', tx.hash);
    return tx.hash;
  }

  async getSplitterBalance(splitterAddress: string): Promise<string> {
    const balance = await this.provider.getBalance(splitterAddress);
    return ethers.formatEther(balance);
  }

  async getReleasableAmount(splitterAddress: string, account: string): Promise<string> {
    const network = (await this.provider.getNetwork()).name as keyof typeof FACTORY_ADDRESSES;
    const factoryAddress = FACTORY_ADDRESSES[network];
    
    if (!factoryAddress) {
      throw new Error(`Factory not available on ${network}`);
    }

    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
    const releasable = await factory.releasableNative(splitterAddress, account);
    return ethers.formatEther(releasable);
  }
}

// Client-side only singleton instance
let contractDeployerInstance: ContractDeployer | null = null;

export const getContractDeployer = (): ContractDeployer => {
  if (typeof window === 'undefined') {
    throw new Error('ContractDeployer can only be used in browser environment');
  }
  
  if (!contractDeployerInstance) {
    contractDeployerInstance = new ContractDeployer();
  }
  
  return contractDeployerInstance;
};

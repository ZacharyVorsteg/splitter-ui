import { BrowserProvider, Contract, JsonRpcSigner, isAddress, parseEther } from "ethers";

async function resolveAddress(input: string, provider: BrowserProvider): Promise<string> {
  const address = input.trim();
  
  if (isAddress(address)) {
    return address;
  }
  
  // For MVP, only accept valid addresses (ENS can be added later)
  throw new Error(`Invalid address: ${address}. Please use a valid 0x... address.`);
}

const FACTORY_ABI = [
  "function createSplitter(address[] payees, uint256[] shares) returns (address)",
  "event SplitterDeployed(address indexed splitter, address indexed owner, address[] payees, uint256[] shares)",
  "function releaseAll(address splitter, address[] payees)",
  "function releaseAllERC20(address splitter, address token, address[] payees)"
];

// Factory addresses - will be updated after deployment
export const FACTORY_ADDRESSES: Record<number, string> = {
  80002: "0x0000000000000000000000000000000000000000", // Amoy testnet
  137: "0x0000000000000000000000000000000000000000"    // Polygon mainnet
};

export interface DeployedSplitter {
  chainId: number;
  address: string;
  name: string;
  timestamp: number;
  network: string;
}

export async function getSigner(): Promise<{provider: BrowserProvider, signer: JsonRpcSigner, chainId: number}> {
  if (!window.ethereum) {
    throw new Error("No wallet found. Please install MetaMask or another Web3 wallet.");
  }
  
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const { chainId } = await provider.getNetwork();
  return { provider, signer, chainId: Number(chainId) };
}

export async function deploySplitter(
  name: string,
  payees: string[], 
  shares: number[]
): Promise<string> {
  const { provider, signer, chainId } = await getSigner();
  const factoryAddr = FACTORY_ADDRESSES[chainId];
  
  if (!factoryAddr || factoryAddr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`Factory not deployed on chain ${chainId}. Switch to Polygon Amoy testnet or contact support.`);
  }

  // Resolve ENS addresses
  const resolvedPayees = await Promise.all(
    payees.map(async (payee) => {
      try {
        return await resolveAddress(payee, provider);
      } catch (error) {
        throw new Error(`Invalid address "${payee}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    })
  );

  const factory = new Contract(factoryAddr, FACTORY_ABI, signer);
  const tx = await factory.createSplitter(resolvedPayees, shares);
  const rcpt = await tx.wait();
  
  let deployed = "";
  for (const log of rcpt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "SplitterDeployed") {
        deployed = parsed.args.splitter;
        break;
      }
    } catch {
      // Skip unparseable logs
    }
  }
  
  if (!deployed) {
    throw new Error("Deployment succeeded but contract address not found in logs.");
  }

  // Persist locally for manage page
  const splitterData: DeployedSplitter = {
    chainId,
    address: deployed,
    name,
    timestamp: Date.now(),
    network: chainId === 80002 ? 'Amoy' : chainId === 137 ? 'Polygon' : 'Unknown'
  };

  const list = JSON.parse(localStorage.getItem("splitters") || "[]");
  list.unshift(splitterData);
  localStorage.setItem("splitters", JSON.stringify(list.slice(0, 50))); // Keep last 50

  return deployed;
}

export function getDeployedSplitters(): DeployedSplitter[] {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem("splitters") || "[]");
}

export async function fundSplitter(splitterAddress: string, amountNative: string): Promise<string> {
  const { signer } = await getSigner();
  
  if (!isAddress(splitterAddress)) {
    throw new Error("Invalid splitter address");
  }

  const tx = await signer.sendTransaction({
    to: splitterAddress,
    value: parseEther(amountNative)
  });

  await tx.wait();
  return tx.hash;
}

export async function releaseAll(splitterAddress: string, payees: string[]): Promise<string> {
  const { signer, chainId } = await getSigner();
  const factoryAddr = FACTORY_ADDRESSES[chainId];
  
  if (!factoryAddr || factoryAddr === "0x0000000000000000000000000000000000000000") {
    throw new Error(`Factory not available on chain ${chainId}`);
  }

  const factory = new Contract(factoryAddr, FACTORY_ABI, signer);
  const tx = await factory.releaseAll(splitterAddress, payees);
  await tx.wait();
  
  return tx.hash;
}

// Real-time gas tracking using ethers and RPC calls
import { ethers } from "ethers";

// RPC providers (browser-friendly) - using public endpoints for demo
const RPCS = {
  ethereum: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://ethereum.publicnode.com"
  ],
  polygon: [
    "https://polygon.llamarpc.com", 
    "https://rpc.ankr.com/polygon",
    "https://polygon-rpc.com"
  ],
};

const CHAIN = {
  ethereum: { id: 1, symbol: "ETH" },
  polygon: { id: 137, symbol: "MATIC" },
};

function makeProvider(network: "ethereum" | "polygon" = "ethereum") {
  const [primary, fallback, tertiary] = RPCS[network];
  const p = new ethers.JsonRpcProvider(primary, CHAIN[network].id);
  // Add fallbacks - using any for provider extensions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p as any)._fallback = new ethers.JsonRpcProvider(fallback, CHAIN[network].id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p as any)._tertiary = new ethers.JsonRpcProvider(tertiary, CHAIN[network].id);
  return p;
}

// Hex -> BigInt helper
const hex = (h: string) => BigInt(h);

// Formatters
export const formatGwei = (weiBig: bigint) => Number(weiBig) / 1e9;
export const formatEth = (weiBig: bigint) => Number(ethers.formatEther(weiBig));

// Core: get a robust EIP-1559 quote (base + priority + max)
export async function getFeeQuote(network: "ethereum" | "polygon" = "ethereum") {
  const provider = makeProvider(network);

  async function callFeeHistory(pr: ethers.JsonRpcProvider) {
    return pr.send("eth_feeHistory", [5, "latest", [10, 50, 90]]);
  }

  let fh: { baseFeePerGas: string[]; reward?: string[][] };
  try {
    fh = await callFeeHistory(provider);
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fh = await callFeeHistory((provider as any)._fallback);
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fh = await callFeeHistory((provider as any)._tertiary);
    }
  }

  // base fee of latest block
  const base = hex(fh.baseFeePerGas[fh.baseFeePerGas.length - 1]);

  // priority fee suggestion: p50 of the most recent block if present
  let priority = BigInt(0);
  if (fh.reward && fh.reward.length) {
    const lastRewards = fh.reward[fh.reward.length - 1]; // array of hex strings
    if (lastRewards[1]) priority = hex(lastRewards[1]);  // 50th percentile
  }

  // Fallbacks if RPC doesn't return reward (some Polygon RPCs do this)
  if (priority === BigInt(0)) {
    try {
      const v = await provider.send("eth_maxPriorityFeePerGas", []);
      priority = hex(v);
    } catch {
      // sensible defaults (gwei) if everything fails
      priority = network === "polygon" ? BigInt(30) * BigInt(10) ** BigInt(9) : BigInt(2) * BigInt(10) ** BigInt(9);
    }
  }

  // Safety headroom: 20% above base + priority
  const maxFee = (base * BigInt(120)) / BigInt(100) + priority;

  return { 
    baseFeePerGas: base, 
    priorityFeePerGas: priority, 
    maxFeePerGas: maxFee, 
    network 
  };
}

// Estimate a tx's cost in native token & USD
export function txCost({ 
  gasUnits, 
  maxFeePerGasWei, 
  nativeUsd 
}: { 
  gasUnits: number; 
  maxFeePerGasWei: bigint; 
  nativeUsd: number | null 
}) {
  const totalWei = BigInt(gasUnits) * BigInt(maxFeePerGasWei);
  const nativeAmount = formatEth(totalWei);           // e.g., ETH or MATIC
  const usd = nativeUsd != null ? nativeAmount * nativeUsd : null;
  return { totalWei, nativeAmount, usd };
}

// Estimate gas for PaymentSplitter operations
export const GAS_ESTIMATES = {
  // Conservative estimates for PaymentSplitter operations
  deploy: 150000,      // Deploy new splitter contract
  release: 80000,      // Release funds to one recipient
  releaseERC20: 100000 // Release ERC20 tokens
};

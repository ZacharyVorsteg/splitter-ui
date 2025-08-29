import { JsonRpcProvider, formatEther } from "ethers";
import { getNativeUsd } from "./coinbaseWS";

const RPCS = {
  ethereum: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
  polygon: ["https://polygon.llamarpc.com", "https://rpc.ankr.com/polygon", "https://polygon-rpc.com"]
};

const CHAIN = { ethereum: 1, polygon: 137 };

function providerFor(network: "ethereum" | "polygon") {
  const [url] = RPCS[network];
  return new JsonRpcProvider(url, CHAIN[network]);
}

export async function getFeeQuote(network: "ethereum" | "polygon") {
  const p = providerFor(network);
  
  try {
    // Last 5 blocks, percentiles 10/50/90
    const fh = await p.send("eth_feeHistory", [5, "latest", [10, 50, 90]]);
    const baseHex = fh.baseFeePerGas[fh.baseFeePerGas.length - 1];
    const base = BigInt(baseHex);

    let priority = BigInt(0);
    if (fh.reward?.length) {
      const last = fh.reward[fh.reward.length - 1];
      if (last?.[1]) priority = BigInt(last[1]);
    }
    
    if (priority === BigInt(0)) {
      try { 
        priority = BigInt(await p.send("eth_maxPriorityFeePerGas", [])); 
      } catch { 
        priority = network === "polygon" ? BigInt(30) * BigInt(10) ** BigInt(9) : BigInt(2) * BigInt(10) ** BigInt(9); 
      }
    }

    const max = (base * BigInt(120)) / BigInt(100) + priority; // 20% headroom
    return { base, priority, max };
    
  } catch (error) {
    // Fallback estimates if RPC fails
    const estimates = {
      ethereum: { base: BigInt(20) * BigInt(10) ** BigInt(9), priority: BigInt(2) * BigInt(10) ** BigInt(9) },
      polygon: { base: BigInt(30) * BigInt(10) ** BigInt(9), priority: BigInt(30) * BigInt(10) ** BigInt(9) }
    };
    
    const est = estimates[network];
    return { 
      base: est.base, 
      priority: est.priority, 
      max: est.base + est.priority 
    };
  }
}

export function estimateUsd({
  gasUnits, 
  maxFeePerGasWei, 
  network
}: { 
  gasUnits: number; 
  maxFeePerGasWei: bigint; 
  network: "ethereum" | "polygon" 
}) {
  const totalWei = BigInt(gasUnits) * maxFeePerGasWei;
  const native = Number(formatEther(totalWei));
  const usd = getNativeUsd(network);
  return { native, usd: usd ? native * usd : undefined };
}

export function formatGwei(wei: bigint): number {
  return Number(wei) / 1e9;
}

'use client';

import { useState, useEffect, useCallback } from 'react';

interface PriceData {
  usd: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  lastUpdated: number | null;
  source: string | null;
  isStale: boolean;
  isLoading: boolean;
  error: string | null;
}

interface GasData {
  standard: number | null;
  fast: number | null;
  instant: number | null;
  baseFee: number | null;
  priorityFee: number | null;
  lastUpdated: number | null;
  isStale: boolean;
  network: string;
}

interface NetworkHealth {
  blockTime: number | null;
  pendingTx: number | null;
  congestion: 'normal' | 'moderate' | 'congested';
  lastBlock: number | null;
  isHealthy: boolean;
}

const PRICE_STALE_THRESHOLD = 60000; // 1 minute
const GAS_STALE_THRESHOLD = 30000; // 30 seconds
const PRICE_POLL_INTERVAL = 3000; // 3 seconds for responsive updates
const GAS_POLL_INTERVAL = 15000; // 15 seconds

export const useLiveData = () => {
  const [ethPrice, setEthPrice] = useState<PriceData>({
    usd: null,
    change24h: null,
    high24h: null,
    low24h: null,
    lastUpdated: null,
    source: null,
    isStale: false,
    isLoading: true,
    error: null,
  });

  const [usdcPrice, setUsdcPrice] = useState<PriceData>({
    usd: 1.0, // USDC should be $1, but we'll verify
    change24h: null,
    high24h: null,
    low24h: null,
    lastUpdated: Date.now(),
    source: 'Fixed',
    isStale: false,
    isLoading: false,
    error: null,
  });

  const [maticPrice, setMaticPrice] = useState<PriceData>({
    usd: null,
    change24h: null,
    high24h: null,
    low24h: null,
    lastUpdated: null,
    source: null,
    isStale: false,
    isLoading: true,
    error: null,
  });

  const [gasData, setGasData] = useState<GasData>({
    standard: null,
    fast: null,
    instant: null,
    baseFee: null,
    priorityFee: null,
    lastUpdated: null,
    isStale: false,
    network: 'ethereum',
  });

  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>({
    blockTime: null,
    pendingTx: null,
    congestion: 'normal',
    lastBlock: null,
    isHealthy: true,
  });

  // Connect to Coinbase Advanced Trade WebSocket for real-time ETH prices
  const connectCoinbaseWebSocket = useCallback(() => {
    let ws: WebSocket | null = null;
    
    try {
      console.log('🔌 Connecting to Coinbase Advanced Trade WebSocket...');
      ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');
      
      ws.onopen = () => {
        console.log('✅ Coinbase WebSocket connected');
        
        // Subscribe to both ETH-USD and MATIC-USD for complete price coverage
        ws?.send(JSON.stringify({
          type: 'subscribe',
          channel: 'ticker',
          product_ids: ['ETH-USD', 'MATIC-USD']
        }));
        
        setEthPrice(prev => ({
          ...prev,
          error: null,
          isLoading: false,
          source: 'Coinbase WebSocket'
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.channel === 'ticker' && msg.events) {
            for (const ev of msg.events) {
              for (const ticker of (ev.tickers || [])) {
                const newPrice = parseFloat(ticker.price);
                
                // Handle ETH-USD updates
                if (ticker.product_id === 'ETH-USD' && ticker.price) {
                  // Sanity check for ETH
                  if (newPrice > 1000 && newPrice < 10000) {
                    setEthPrice(prev => {
                      const priceChanged = prev.usd !== newPrice;
                      const changeAmount = prev.usd ? newPrice - prev.usd : 0;
                      const changePercent = prev.usd ? ((changeAmount / prev.usd) * 100) : 0;
                      
                      if (priceChanged) {
                        console.log(`🔄 LIVE ETH: $${prev.usd?.toFixed(2)} → $${newPrice.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(4)}%)`);
                      }
                      
                      return {
                        ...prev,
                        usd: newPrice,
                        lastUpdated: Date.now(),
                        source: 'Coinbase Live',
                        isStale: false,
                        isLoading: false,
                        error: null,
                      };
                    });
                  }
                }
                
                // Handle MATIC-USD updates
                if (ticker.product_id === 'MATIC-USD' && ticker.price) {
                  // Sanity check for MATIC
                  if (newPrice > 0.1 && newPrice < 10) {
                    setMaticPrice(prev => {
                      const priceChanged = prev.usd !== newPrice;
                      const changeAmount = prev.usd ? newPrice - prev.usd : 0;
                      const changePercent = prev.usd ? ((changeAmount / prev.usd) * 100) : 0;
                      
                      if (priceChanged) {
                        console.log(`🔄 LIVE MATIC: $${prev.usd?.toFixed(4)} → $${newPrice.toFixed(4)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(4)}%)`);
                      }
                      
                      return {
                        ...prev,
                        usd: newPrice,
                        lastUpdated: Date.now(),
                        source: 'Coinbase Live',
                        isStale: false,
                        isLoading: false,
                        error: null,
                      };
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ WebSocket message parsing error:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ Coinbase WebSocket error:', error);
        setEthPrice(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          isStale: true
        }));
      };
      
      ws.onclose = (event) => {
        console.log(`🔌 Coinbase WebSocket closed (${event.code}), reconnecting in 5s...`);
        setEthPrice(prev => ({
          ...prev,
          source: prev.source + ' (Reconnecting)',
          isStale: true
        }));
        
        // Reconnect after delay
        setTimeout(() => {
          console.log('🔄 Attempting WebSocket reconnection...');
          connectCoinbaseWebSocket();
        }, 5000);
      };
      
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setEthPrice(prev => ({
        ...prev,
        error: 'Failed to establish WebSocket connection',
        isStale: true
      }));
    }
    
    return ws;
  }, []);

  // Fallback REST API fetch for initial load (using CORS proxy if needed)
  const fetchEthPriceFallback = useCallback(async () => {
    try {
      console.log('📡 Fetching ETH price via REST fallback...');
      
      // Use a CORS proxy for CoinGecko if direct calls fail
      const proxyUrl = 'https://api.allorigins.win/get?url=';
      const targetUrl = encodeURIComponent('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_high_low_24h=true');
      
      const response = await fetch(proxyUrl + targetUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`Proxy API error: ${response.status}`);
      }
      
      const proxyData = await response.json();
      const data = JSON.parse(proxyData.contents);
      const ethData = data.ethereum;
      
      if (!ethData?.usd || ethData.usd < 1000 || ethData.usd > 10000) {
        throw new Error(`Invalid ETH price: ${ethData?.usd}`);
      }
      
      console.log(`💰 ETH price fetched: $${ethData.usd} via CoinGecko (CORS proxy)`);
      
      setEthPrice({
        usd: ethData.usd,
        change24h: ethData.usd_24h_change || 0,
        high24h: ethData.usd_24h_high || ethData.usd,
        low24h: ethData.usd_24h_low || ethData.usd,
        lastUpdated: Date.now(),
        source: 'CoinGecko',
        isStale: false,
        isLoading: false,
        error: null,
      });
      
    } catch (error) {
      console.error('❌ Fallback price fetch failed:', error);
      setEthPrice(prev => ({
        ...prev,
        isLoading: false,
        error: `Price fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isStale: true,
      }));
    }
  }, []);

  // Fetch real gas prices using RPC calls
  const fetchGasData = useCallback(async (network: 'ethereum' | 'polygon' = 'ethereum') => {
    try {
      console.log(`⛽ Fetching live gas data for ${network}...`);
      
      // Import the gas utilities
      const { getFeeQuote, formatGwei } = await import('../utils/gas');
      
      // Get real-time gas data from the blockchain
      const quote = await getFeeQuote(network);
      
      const baseGwei = formatGwei(quote.baseFeePerGas);
      const priorityGwei = formatGwei(quote.priorityFeePerGas);
      const maxGwei = formatGwei(quote.maxFeePerGas);
      
      // Calculate different speed options
      const standard = Math.round(baseGwei + priorityGwei);
      const fast = Math.round(maxGwei);
      const instant = Math.round(maxGwei * 1.2);
      
      setGasData({
        standard,
        fast,
        instant,
        baseFee: baseGwei,
        priorityFee: priorityGwei,
        lastUpdated: Date.now(),
        isStale: false,
        network,
      });
      
      console.log(`⛽ Live gas data: ${standard}/${fast}/${instant} gwei (base: ${baseGwei.toFixed(1)}, priority: ${priorityGwei.toFixed(1)})`);
      
    } catch (error) {
      console.warn('⚠️ RPC gas fetch failed, using estimates:', error);
      
      // Fallback to time-based estimates
      const now = new Date();
      const hour = now.getUTCHours();
      let multiplier = 1.0;
      
      // Peak hours adjustment
      if ((hour >= 12 && hour <= 16) || (hour >= 20 && hour <= 24)) {
        multiplier = 1.4;
      } else if (hour >= 2 && hour <= 6) {
        multiplier = 0.7;
      }
      
      const estimates = {
        ethereum: { 
          standard: Math.round(20 * multiplier), 
          fast: Math.round(30 * multiplier), 
          instant: Math.round(45 * multiplier) 
        },
        polygon: { standard: 30, fast: 50, instant: 80 },
      };
      
      const gasEst = estimates[network] || estimates.ethereum;
      
      setGasData({
        standard: gasEst.standard,
        fast: gasEst.fast,
        instant: gasEst.instant,
        baseFee: null,
        priorityFee: null,
        lastUpdated: Date.now(),
        isStale: true, // Mark as estimated
        network,
      });
      
      console.log(`⛽ Using time-adjusted estimates: ${gasEst.standard}/${gasEst.fast}/${gasEst.instant} gwei`);
    }
  }, []);

  // Check if data is stale
  const checkStaleness = useCallback(() => {
    const now = Date.now();
    
    setEthPrice(prev => ({
      ...prev,
      isStale: prev.lastUpdated ? (now - prev.lastUpdated) > PRICE_STALE_THRESHOLD : true
    }));

    setGasData(prev => ({
      ...prev,
      isStale: prev.lastUpdated ? (now - prev.lastUpdated) > GAS_STALE_THRESHOLD : true
    }));
  }, []); // Stable callback

  // Initialize real-time price tracking
  useEffect(() => {
    console.log('🚀 Initializing real-time ETH price tracking...');
    
    // Start with immediate fallback fetch for initial price
    fetchEthPriceFallback();
    fetchGasData('ethereum'); // Start with Ethereum gas data

    // Connect WebSocket for real-time updates
    const ws = connectCoinbaseWebSocket();

    // Fallback polling in case WebSocket fails (every 30 seconds)
    const fallbackInterval = setInterval(() => {
      // Only use fallback if WebSocket data is stale
      setEthPrice(prev => {
        if (prev.lastUpdated && (Date.now() - prev.lastUpdated) > PRICE_STALE_THRESHOLD) {
          console.log('⚠️ WebSocket data stale, using REST fallback...');
          fetchEthPriceFallback();
        }
        return prev;
      });
    }, 30000);

    // Gas polling with network-specific calls
    const gasInterval = setInterval(() => fetchGasData('ethereum'), GAS_POLL_INTERVAL);
    const stalenessInterval = setInterval(checkStaleness, 5000);

    return () => {
      console.log('🧹 Cleaning up price tracking connections...');
      if (ws) {
        ws.close();
      }
      clearInterval(fallbackInterval);
      clearInterval(gasInterval);
      clearInterval(stalenessInterval);
    };
  }, []); // Stable - no dependencies needed

  // Calculate gas cost in USD
  const calculateGasCost = useCallback((gasLimit: number = 21000, speed: 'standard' | 'fast' | 'instant' = 'standard') => {
    if (!gasData[speed] || !ethPrice.usd) return null;
    
    const gasPriceGwei = gasData[speed];
    const gasLimitNum = gasLimit;
    const ethPriceUsd = ethPrice.usd;
    
    // Convert gwei to ETH: gwei * gasLimit / 1e9
    const gasCostEth = (gasPriceGwei * gasLimitNum) / 1e9;
    const gasCostUsd = gasCostEth * ethPriceUsd;
    
    return {
      eth: gasCostEth,
      usd: gasCostUsd,
      gwei: gasPriceGwei
    };
  }, [gasData, ethPrice.usd]);

  // Manual refresh function
  const refresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered');
    fetchEthPriceFallback();
    fetchGasData();
  }, [fetchEthPriceFallback, fetchGasData]);

  // Get volatility level
  const getVolatilityLevel = useCallback(() => {
    if (!ethPrice.change24h) return 'unknown';
    const absChange = Math.abs(ethPrice.change24h);
    if (absChange < 2) return 'low';
    if (absChange < 5) return 'moderate';
    return 'high';
  }, [ethPrice.change24h]);

  return {
    ethPrice,
    usdcPrice,
    maticPrice,
    gasData,
    networkHealth,
    calculateGasCost,
    refresh,
    getVolatilityLevel,
    isConnected: !ethPrice.error && !ethPrice.isStale,
  };
};

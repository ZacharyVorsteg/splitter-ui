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
const PRICE_POLL_INTERVAL = 10000; // 10 seconds
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

  // Fetch ETH price from multiple sources with validation
  const fetchEthPrice = useCallback(async () => {
    try {
      setEthPrice(prev => ({ ...prev, isLoading: true, error: null }));

      // Try multiple sources in parallel for validation
      const sources = [
        {
          name: 'CoinGecko',
          url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_high_low_24h=true',
          parser: (data: { ethereum?: { usd?: number; usd_24h_change?: number; usd_24h_high?: number; usd_24h_low?: number } }) => ({
            price: data.ethereum?.usd,
            change24h: data.ethereum?.usd_24h_change,
            high24h: data.ethereum?.usd_24h_high,
            low24h: data.ethereum?.usd_24h_low
          })
        },
        {
          name: 'Binance',
          url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT',
          parser: (data: { lastPrice?: string; priceChangePercent?: string; highPrice?: string; lowPrice?: string }) => ({
            price: parseFloat(data.lastPrice || '0'),
            change24h: parseFloat(data.priceChangePercent || '0'),
            high24h: parseFloat(data.highPrice || '0'),
            low24h: parseFloat(data.lowPrice || '0')
          })
        },
        {
          name: 'CoinCap',
          url: 'https://api.coincap.io/v2/assets/ethereum',
          parser: (data: { data?: { priceUsd?: string; changePercent24Hr?: string } }) => ({
            price: parseFloat(data.data?.priceUsd || '0'),
            change24h: parseFloat(data.data?.changePercent24Hr || '0'),
            high24h: null,
            low24h: null
          })
        }
      ];

      const results = await Promise.allSettled(
        sources.map(async (source) => {
          const response = await fetch(source.url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000)
          });
          
          if (!response.ok) {
            throw new Error(`${source.name} API error: ${response.status}`);
          }
          
          const data = await response.json();
          const parsed = source.parser(data);
          
          // Sanity check: ETH should be between $1000 and $10000
          if (!parsed.price || parsed.price < 1000 || parsed.price > 10000) {
            throw new Error(`${source.name} returned invalid price: ${parsed.price}`);
          }
          
          return {
            ...parsed,
            source: source.name
          };
        })
      );

      // Find successful results
      const successfulResults = results
        .filter((result) => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<{ price: number; change24h: number; high24h: number | null; low24h: number | null; source: string }>).value);

      if (successfulResults.length === 0) {
        throw new Error('All price sources failed');
      }

      // Use the first successful result, but log if there are major discrepancies
      const primaryResult = successfulResults[0];
      
      // Check for price discrepancies between sources (> 5% difference is suspicious)
      if (successfulResults.length > 1) {
        const prices = successfulResults.map(r => r.price);
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const discrepancy = ((maxPrice - minPrice) / minPrice) * 100;
        
        if (discrepancy > 5) {
          console.warn(`Large price discrepancy detected: ${discrepancy.toFixed(2)}%`, {
            prices: successfulResults.map(r => ({ source: r.source, price: r.price }))
          });
        }
      }

      console.log(`ETH price fetched: $${primaryResult.price} from ${primaryResult.source}`);

      setEthPrice({
        usd: primaryResult.price,
        change24h: primaryResult.change24h || 0,
        high24h: primaryResult.high24h || primaryResult.price,
        low24h: primaryResult.low24h || primaryResult.price,
        lastUpdated: Date.now(),
        source: primaryResult.source,
        isStale: false,
        isLoading: false,
        error: null,
      });

    } catch (error) {
      console.error('All price sources failed:', error);
      setEthPrice(prev => ({
        ...prev,
        isLoading: false,
        error: `Unable to fetch current ETH price: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isStale: true,
      }));
    }
  }, []);

  // Fetch gas prices (simplified - in production you'd use APIs like ETH Gas Station)
  const fetchGasData = useCallback(async () => {
    try {
      // For now, we'll use a simple approach - in production use proper gas APIs
      const response = await fetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=YourApiKeyToken', {
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === '1') {
          setGasData({
            standard: parseInt(data.result.SafeGasPrice),
            fast: parseInt(data.result.ProposeGasPrice),
            instant: parseInt(data.result.FastGasPrice),
            baseFee: null, // Would need additional API call
            priorityFee: null,
            lastUpdated: Date.now(),
            isStale: false,
            network: 'ethereum',
          });
          return;
        }
      }

      // Fallback gas estimates if API fails
      setGasData({
        standard: 20,
        fast: 30,
        instant: 50,
        baseFee: null,
        priorityFee: null,
        lastUpdated: Date.now(),
        isStale: true, // Mark as stale since it's estimated
        network: 'ethereum',
      });

    } catch (error) {
      console.warn('Gas price fetch failed:', error);
      // Use conservative estimates
      setGasData({
        standard: 25,
        fast: 35,
        instant: 60,
        baseFee: null,
        priorityFee: null,
        lastUpdated: Date.now(),
        isStale: true,
        network: 'ethereum',
      });
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
  }, []);

  // Initialize and set up real-time connections
  useEffect(() => {
    // Initial fetch
    fetchEthPrice();
    fetchGasData();

    // Try WebSocket for real-time data first, fallback to polling
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let priceInterval: NodeJS.Timeout | null = null;
    
    const connectWebSocket = () => {
      try {
        // Use Binance WebSocket for real-time ETH price
        ws = new WebSocket('wss://stream.binance.com:9443/ws/ethusdt@ticker');
        
        ws.onopen = () => {
          console.log('WebSocket connected for real-time ETH prices');
          // Clear polling interval since we have WebSocket
          if (priceInterval) {
            clearInterval(priceInterval);
            priceInterval = null;
          }
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const price = parseFloat(data.c); // Current price
            const change24h = parseFloat(data.P); // 24h change percentage
            const high24h = parseFloat(data.h); // 24h high
            const low24h = parseFloat(data.l); // 24h low
            
            // Sanity check
            if (price > 1000 && price < 10000) {
              setEthPrice({
                usd: price,
                change24h: change24h,
                high24h: high24h,
                low24h: low24h,
                lastUpdated: Date.now(),
                source: 'Binance WebSocket',
                isStale: false,
                isLoading: false,
                error: null,
              });
            }
          } catch (error) {
            console.warn('WebSocket message parsing error:', error);
          }
        };
        
        ws.onerror = (error) => {
          console.warn('WebSocket error:', error);
        };
        
        ws.onclose = () => {
          console.log('WebSocket closed, falling back to polling...');
          ws = null;
          
          // Fallback to polling
          if (!priceInterval) {
            priceInterval = setInterval(fetchEthPrice, PRICE_POLL_INTERVAL);
          }
          
          // Try to reconnect WebSocket after 10 seconds
          reconnectTimeout = setTimeout(connectWebSocket, 10000);
        };
        
      } catch (error) {
        console.warn('WebSocket connection failed, using polling:', error);
        // Start polling immediately if WebSocket fails
        if (!priceInterval) {
          priceInterval = setInterval(fetchEthPrice, PRICE_POLL_INTERVAL);
        }
      }
    };

    // Try WebSocket first
    connectWebSocket();

    // Always set up gas polling (no reliable WebSocket for gas prices)
    const gasInterval = setInterval(fetchGasData, GAS_POLL_INTERVAL);
    const stalenessInterval = setInterval(checkStaleness, 5000);

    return () => {
      // Cleanup
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (priceInterval) {
        clearInterval(priceInterval);
      }
      clearInterval(gasInterval);
      clearInterval(stalenessInterval);
    };
  }, [fetchEthPrice, fetchGasData, checkStaleness]);

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
    fetchEthPrice();
    fetchGasData();
  }, [fetchEthPrice, fetchGasData]);

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
    gasData,
    networkHealth,
    calculateGasCost,
    refresh,
    getVolatilityLevel,
    isConnected: !ethPrice.error && !ethPrice.isStale,
  };
};

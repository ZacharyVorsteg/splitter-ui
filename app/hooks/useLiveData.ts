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

  // Fetch ETH price from CoinGecko with fallback to CoinMarketCap
  const fetchEthPrice = useCallback(async () => {
    try {
      setEthPrice(prev => ({ ...prev, isLoading: true, error: null }));

      // Primary: CoinGecko
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_low_24h=true',
        { 
          headers: { 'Accept': 'application/json' },
          // Add timeout
          signal: AbortSignal.timeout(5000)
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const ethData = data.ethereum;

      if (!ethData || !ethData.usd) {
        throw new Error('Invalid price data from CoinGecko');
      }

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
      console.warn('CoinGecko failed, trying fallback...', error);
      
      try {
        // Fallback: Alternative API (we'll use a simple public API)
        const fallbackResponse = await fetch(
          'https://api.coinbase.com/v2/exchange-rates?currency=ETH',
          { signal: AbortSignal.timeout(5000) }
        );

        if (!fallbackResponse.ok) {
          throw new Error('Fallback API also failed');
        }

        const fallbackData = await fallbackResponse.json();
        const usdRate = parseFloat(fallbackData.data.rates.USD);

        if (!usdRate || isNaN(usdRate)) {
          throw new Error('Invalid fallback price data');
        }

        setEthPrice({
          usd: usdRate,
          change24h: null, // Fallback doesn't have change data
          high24h: null,
          low24h: null,
          lastUpdated: Date.now(),
          source: 'Coinbase',
          isStale: false,
          isLoading: false,
          error: null,
        });

      } catch (fallbackError) {
        console.error('All price feeds failed:', fallbackError);
        setEthPrice(prev => ({
          ...prev,
          isLoading: false,
          error: 'Unable to fetch current ETH price. All price feeds are unavailable.',
          isStale: true,
        }));
      }
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

  // Initialize and set up polling
  useEffect(() => {
    // Initial fetch
    fetchEthPrice();
    fetchGasData();

    // Set up polling intervals
    const priceInterval = setInterval(fetchEthPrice, PRICE_POLL_INTERVAL);
    const gasInterval = setInterval(fetchGasData, GAS_POLL_INTERVAL);
    const stalenessInterval = setInterval(checkStaleness, 5000); // Check staleness every 5s

    return () => {
      clearInterval(priceInterval);
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

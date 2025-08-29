'use client';

import React from 'react';

interface NetworkStatusProps {
  ethPrice: {
    usd: number | null;
    change24h: number | null;
    lastUpdated: number | null;
    source: string | null;
    isStale: boolean;
    isLoading: boolean;
    error: string | null;
  };
  gasData: {
    standard: number | null;
    fast: number | null;
    lastUpdated: number | null;
    isStale: boolean;
  };
  networkName: string;
  onRefresh: () => void;
}

export default function NetworkStatus({ ethPrice, gasData, networkName, onRefresh }: NetworkStatusProps) {
  const getStatusColor = (isStale: boolean, isLoading: boolean, error: string | null) => {
    if (error) return 'bg-red-500';
    if (isStale) return 'bg-yellow-500';
    if (isLoading) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getTimeAgo = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getUpdateIndicator = (timestamp: number | null) => {
    if (!timestamp) return null;
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          UPDATING
        </span>
      );
    }
    return null;
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '---';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (change: number | null) => {
    if (!change) return null;
    const isPositive = change > 0;
    return (
      <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Network Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(false, false, null)}`}></div>
            <span className="text-sm font-medium text-gray-900">{networkName}</span>
          </div>

          {/* ETH Price */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(ethPrice.isStale, ethPrice.isLoading, ethPrice.error)}`}></div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">ETH:</span>
              {ethPrice.isLoading ? (
                <div className="animate-pulse bg-gray-200 h-4 w-16 rounded"></div>
              ) : ethPrice.error ? (
                <span className="text-sm text-red-600">Error</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatPrice(ethPrice.usd)}
                  </span>
                  {formatChange(ethPrice.change24h)}
                </div>
              )}
            </div>
          </div>

          {/* Gas Price */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(gasData.isStale, false, null)}`}></div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Gas:</span>
              {gasData.standard ? (
                <span className="text-sm font-medium text-gray-900">
                  {gasData.standard} gwei
                </span>
              ) : (
                <span className="text-sm text-gray-500">Loading...</span>
              )}
            </div>
          </div>
        </div>

        {/* Last Updated & Refresh */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span>Updated {getTimeAgo(ethPrice.lastUpdated)}</span>
            {ethPrice.source && (
              <span>via {ethPrice.source}</span>
            )}
            {getUpdateIndicator(ethPrice.lastUpdated)}
          </div>
          
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            title="Refresh data"
          >
            <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Warning for stale data */}
      {(ethPrice.isStale || ethPrice.error) && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">
                {ethPrice.error ? 'Price data connection lost' : 'Price data is stale'}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {ethPrice.error 
                  ? 'Unable to fetch current prices. Calculations may be inaccurate.'
                  : 'Price data hasn\'t updated recently. Consider refreshing before making decisions.'
                }
              </p>
            </div>
            <button
              onClick={onRefresh}
              className="ml-auto px-3 py-1 bg-red-100 text-red-800 rounded-md text-xs hover:bg-red-200 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Volatility Warning */}
      {ethPrice.change24h && Math.abs(ethPrice.change24h) > 5 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">High volatility detected</p>
              <p className="text-xs text-amber-700">
                ETH has moved {Math.abs(ethPrice.change24h).toFixed(1)}% in the last 24 hours. 
                Actual split amounts may vary significantly.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

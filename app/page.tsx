'use client';
import React, { useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import NetworkStatus from './components/NetworkStatus';
import { useLiveData } from './hooks/useLiveData';

type Recipient = { id: string; input: string; address: string | null; percent: string };
type Step = 1 | 2 | 3;

function isEthAddress(s: string) { return /^0x[a-fA-F0-9]{40}$/.test(s.trim()); }
function looksLikeENS(s: string) { return s.trim().toLowerCase().endsWith('.eth'); }
function toFixed2(n: number) { return (Math.round(n * 100) / 100).toFixed(2); }
function toBps(percent: number) { return Math.round(percent * 100); }
function uid() { return Math.random().toString(36).slice(2, 9); }

export default function Page() {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('Design Team Splitter');
  const [network, setNetwork] = useState<'Polygon' | 'Ethereum' | 'Arbitrum'>('Polygon');
  const [token, setToken] = useState<'ETH' | 'USDC'>('ETH');

  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: uid(), input: '', address: null, percent: '' },
  ]);
  const [testAmount, setTestAmount] = useState<string>('1.00');
  
  // Use live data instead of static values
  const { ethPrice, usdcPrice, gasData, calculateGasCost, refresh, getVolatilityLevel, isConnected } = useLiveData();

  const parsedPercents = recipients.map(r => Number(r.percent || '0'));
  const sumPercent = parsedPercents.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
  const sumOk = Math.abs(sumPercent - 100) < 0.001;

  const duplicateAddresses = useMemo(() => {
    const seen: Record<string, number> = {};
    const dups = new Set<string>();
    recipients.forEach(r => {
      const key = (r.address || r.input.trim()).toLowerCase();
      if (!key) return;
      if (seen[key]) dups.add(key);
      else seen[key] = 1;
    });
    return dups;
  }, [recipients]);

  function updateRecipient(id: string, patch: Partial<Recipient>) {
    setRecipients(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRecipients(prev => [...prev, { id: uid(), input: '', address: null, percent: '' }]);
  }
  function removeRow(id: string) {
    setRecipients(prev => (prev.length === 1 ? prev : prev.filter(r => r.id !== id)));
  }

  function normalizeAddressOrENS(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return { address: null, hint: '' };
    if (isEthAddress(trimmed)) return { address: trimmed, hint: 'Valid address' };
    if (looksLikeENS(trimmed)) return { address: null, hint: 'ENS will resolve at deploy' };
    return { address: null, hint: 'Enter 0x… or ENS (.eth)' };
  }

  function autoBalanceLast() {
    if (recipients.length < 2) return;
    const others = recipients.slice(0, -1).reduce((a, r) => a + (Number(r.percent || '0') || 0), 0);
    const remainder = Math.max(0, 100 - others);
    updateRecipient(recipients[recipients.length - 1].id, { percent: toFixed2(remainder) });
  }

  function handleCSVImport(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows: Recipient[] = lines.map(l => {
      const [addr, pct] = l.split(',').map(s => s.trim());
      const { address } = normalizeAddressOrENS(addr);
      return { id: uid(), input: addr, address, percent: pct ?? '' };
    });
    if (rows.length) setRecipients(rows);
    setStep(2);
  }

  const testAmountNum = Number(testAmount || '0');
  const preview = sumOk
    ? recipients.map(r => ({
        id: r.id,
        input: r.input,
        address: r.address,
        percent: Number(r.percent || '0'),
        amount: (testAmountNum * (Number(r.percent || '0') / 100)) || 0,
      }))
    : [];

  function canNextFromStep1() { return name.trim().length >= 3; }
  function canNextFromStep2() {
    const nonEmpty = recipients.every(r => r.input.trim() && r.percent.trim());
    const validPercent = recipients.every(r => {
      const n = Number(r.percent);
      return isFinite(n) && n >= 0 && n <= 100;
    });
    const noDups = duplicateAddresses.size === 0;
    return nonEmpty && validPercent && sumOk && noDups;
  }

  const sumChip = (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        (sumOk ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')
      }
      aria-live="polite"
    >
      Sum = {toFixed2(sumPercent)}%
    </span>
  );

  // Get current price for calculations
  const currentPrice = token === 'ETH' ? ethPrice.usd : usdcPrice.usd;

  return (
    <>
      <Header currentStep={step} totalSteps={3} />
      <NetworkStatus 
        ethPrice={ethPrice}
        gasData={gasData}
        networkName={network}
        onRefresh={refresh}
      />
      <main className="space-y-6">

        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-slide-up">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Configure Your Payment Splitter</h2>
            
            <div className="space-y-6">
              {/* Splitter Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                  Splitter Name
                  <span className="tooltip ml-1">
                    <svg className="h-4 w-4 text-[#0052FF] cursor-help inline" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span className="tooltip-text">Give your payment splitter a descriptive name</span>
                  </span>
                </label>
                <input
                  id="name"
                  className={`w-full rounded-lg border px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 ${
                    name.trim().length >= 3 
                      ? 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]' 
                      : name.trim().length > 0 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                        : 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]'
                  }`}
                  placeholder="Q1 Revenue Share"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-600">e.g., &lsquo;Q1 Revenue Share&rsquo; - This helps you identify your splitter</p>
                  {name.trim().length > 0 && name.trim().length < 3 && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Minimum 3 characters required
                    </p>
                  )}
                  {name.trim().length >= 3 && (
                    <p className="text-xs text-green-600 flex items-center gap-1 animate-fade-in">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Looks good!
                    </p>
                  )}
                </div>
              </div>

              {/* Network and Token Selection */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Network
                    <span className="tooltip ml-1">
                      <svg className="h-4 w-4 text-[#0052FF] cursor-help inline" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span className="tooltip-text">Choose blockchain network for deployment</span>
                    </span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF]"
                    value={network}
                    onChange={e => setNetwork(e.target.value as 'Polygon' | 'Ethereum' | 'Arbitrum')}
                  >
                    <option value="Polygon">🟣 Polygon</option>
                    <option value="Ethereum">🔵 Ethereum</option>
                    <option value="Arbitrum">🔴 Arbitrum</option>
                  </select>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Gas estimate:</span>
                      <div className="text-right">
                        {network === 'Ethereum' && gasData.standard && !gasData.isStale ? (
                          <div>
                            <span className="font-medium text-gray-900">
                              ${calculateGasCost(150000, 'standard')?.usd.toFixed(2)} (Standard)
                            </span>
                            <div className="text-xs text-gray-500">
                              ${calculateGasCost(150000, 'fast')?.usd.toFixed(2)} (Fast)
                            </div>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">
                            {network === 'Polygon' && '~$0.01'}
                            {network === 'Ethereum' && gasData.isStale ? '~$15-50' : 'Loading...'}
                            {network === 'Arbitrum' && '~$0.50'}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {network === 'Polygon' && 'Low fees, fast transactions. Great for frequent splits.'}
                      {network === 'Ethereum' && 'Most secure and decentralized, but higher fees.'}
                      {network === 'Arbitrum' && 'Layer 2 solution with lower fees than Ethereum.'}
                    </p>
                    {network === 'Ethereum' && gasData.isStale && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Gas estimates may be outdated
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Token
                    <span className="tooltip ml-1">
                      <svg className="h-4 w-4 text-[#0052FF] cursor-help inline" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span className="tooltip-text">Choose which token to split</span>
                    </span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF]"
                    value={token}
                    onChange={e => setToken(e.target.value as 'ETH' | 'USDC')}
                  >
                    <option value="ETH">💎 ETH</option>
                    <option value="USDC">💵 USDC</option>
                  </select>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Current price:</span>
                      <div className="text-right">
                        {token === 'ETH' ? (
                          ethPrice.isLoading ? (
                            <div className="animate-pulse bg-gray-200 h-4 w-16 rounded"></div>
                          ) : ethPrice.error ? (
                            <span className="text-red-600">Error</span>
                          ) : ethPrice.usd ? (
                            <div>
                              <span className="font-medium text-gray-900">
                                ${ethPrice.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {ethPrice.change24h && (
                                <div className={`text-xs ${ethPrice.change24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {ethPrice.change24h > 0 ? '↑' : '↓'}{Math.abs(ethPrice.change24h).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">Loading...</span>
                          )
                        ) : (
                          <span className="font-medium text-gray-900">$1.00</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-600">
                        {token === 'ETH' && 'Native token, widely accepted across DeFi.'}
                        {token === 'USDC' && 'Stable value pegged to USD, great for predictable splits.'}
                      </p>
                      {token === 'ETH' && ethPrice.lastUpdated && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            ethPrice.error ? 'bg-red-500' : 
                            ethPrice.isStale ? 'bg-yellow-500' : 
                            'bg-green-500 animate-pulse'
                          }`}></div>
                          Updated {Math.floor((Date.now() - ethPrice.lastUpdated) / 1000)}s ago
                          {ethPrice.source && (
                            <span className="text-blue-600">({ethPrice.source})</span>
                          )}
                        </span>
                      )}
                    </div>
                    {token === 'ETH' && ethPrice.isStale && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Price data may be outdated
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
                onClick={() => handleCSVImport('0x0000000000000000000000000000000000000001,50\n0x0000000000000000000000000000000000000002,50')}
              >
                <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Try Sample Data
              </button>
              <button
                disabled={!canNextFromStep1()}
                className={`rounded-lg px-6 py-3 text-sm font-medium transition-all flex items-center gap-2 shadow-sm ${
                  canNextFromStep1() 
                    ? 'bg-[#0052FF] text-white hover:bg-[#0041CC] hover:shadow-md' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                onClick={() => setStep(2)}
              >
                Continue to Recipients
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Recipients Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Recipients & Shares</h2>
                  <p className="text-sm text-gray-600 mt-1">Add wallet addresses and their percentage shares</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Total allocated</div>
                    <div className={`text-lg font-semibold ${sumOk ? 'text-green-600' : 'text-gray-900'}`}>
                      {toFixed2(sumPercent)}% of 100%
                    </div>
                  </div>
                  <CSVImporter onImport={handleCSVImport} />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Share Distribution</span>
                  <span>{sumOk ? 'Complete' : 'In Progress'}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-300 ${
                      sumOk ? 'bg-green-500' : sumPercent > 100 ? 'bg-red-500' : 'bg-[#0052FF]'
                    }`}
                    style={{ width: `${Math.min(sumPercent, 100)}%` }}
                  ></div>
                </div>
                {sumPercent > 100 && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Total exceeds 100%. Please adjust your percentages.
                  </p>
                )}
              </div>

              {/* Recipients List */}
              <div className="space-y-4">
                {recipients.map((r, i) => {
                  const { hint } = normalizeAddressOrENS(r.input);
                  const keyLower = (r.address || r.input.trim()).toLowerCase();
                  const isDup = keyLower && duplicateAddresses.has(keyLower);
                  const pct = Number(r.percent || '0');
                  const pctValid = isFinite(pct) && pct >= 0 && pct <= 100;

                  return (
                    <div key={r.id} className="bg-gray-50 rounded-lg p-4 animate-slide-up">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Recipient {i + 1} Address
                          </label>
                          <input
                            className={`w-full rounded-lg border px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 ${
                              r.input.trim() && !isDup && hint !== 'Enter 0x… or ENS (.eth)'
                                ? 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]'
                                : r.input.trim()
                                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                  : 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]'
                            }`}
                            placeholder="0x742d35Cc6634C0532925a3b8D1c9d9cB2C4c0C0 or vitalik.eth"
                            value={r.input}
                            onChange={e => updateRecipient(r.id, { input: e.target.value })}
                            aria-label={`Recipient ${i + 1} address or ENS`}
                          />
                          <div className="mt-2 flex items-center gap-3">
                            {hint && (
                              <span className={`text-xs flex items-center gap-1 ${
                                hint === 'Valid address' ? 'text-green-600' :
                                hint === 'ENS will resolve at deploy' ? 'text-blue-600' : 'text-gray-500'
                              }`}>
                                {hint === 'Valid address' && (
                                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                                {hint}
                              </span>
                            )}
                            {isDup && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
                                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                Duplicate address
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="w-32">
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Share %
                          </label>
                          <input
                            className={`w-full rounded-lg border px-4 py-3 text-sm text-center transition-all focus:outline-none focus:ring-2 ${
                              pctValid && pct > 0
                                ? 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]'
                                : r.percent.trim()
                                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                  : 'border-gray-300 focus:ring-[#0052FF] focus:border-[#0052FF]'
                            }`}
                            placeholder="25.0"
                            inputMode="decimal"
                            value={r.percent}
                            onChange={e => {
                              const v = e.target.value.replace(/[^0-9.]/g, '');
                              updateRecipient(r.id, { percent: v });
                            }}
                            aria-label={`Recipient ${i + 1} percent`}
                          />
                          {pct > 0 && (
                            <div className="mt-1 text-xs text-center text-gray-500">
                              {toBps(pct)} bps
                            </div>
                          )}
                        </div>

                        <div className="pt-8">
                          <button
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg p-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => removeRow(r.id)}
                            aria-label={`Remove recipient ${i + 1}`}
                            disabled={recipients.length === 1}
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Recipient Button */}
              <div className="pt-4 border-t border-gray-200">
                <button 
                  className="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:border-[#0052FF] hover:text-[#0052FF] transition-all flex items-center justify-center gap-2"
                  onClick={addRow}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Another Recipient
                </button>
              </div>
            </div>

            {/* Test Your Configuration */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Test Your Configuration</h3>
                <p className="text-sm text-gray-600">Enter a test amount to see how funds would be distributed to each recipient</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Test Amount ({token})
                </label>
                <div className="relative">
                  <input
                    className="w-full rounded-lg border border-gray-300 px-4 py-4 text-lg font-semibold text-center transition-all focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF]"
                    placeholder="1.00"
                    value={testAmount}
                    onChange={e => setTestAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                    {token}
                  </div>
                </div>
                {currentPrice && testAmountNum > 0 && (
                  <p className="mt-2 text-sm text-gray-600 text-center">
                    ≈ ${toFixed2(testAmountNum * currentPrice)} USD
                    {token === 'ETH' && ethPrice.change24h && Math.abs(ethPrice.change24h) > 2 && (
                      <span className="block text-xs text-amber-600 mt-1">
                        ±${toFixed2(testAmountNum * currentPrice * Math.abs(ethPrice.change24h) / 100)} 
                        ({Math.abs(ethPrice.change24h).toFixed(1)}% volatility)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {!sumOk && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-amber-800">
                      Total must be exactly 100.00% to see accurate preview
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-4">Distribution Preview</h4>
                {preview.length > 0 ? (
                  <div className="space-y-3">
                    {preview.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[#0052FF] text-white rounded-full flex items-center justify-center text-sm font-medium">
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">
                              {p.input || `Recipient ${i + 1}`}
                            </div>
                            <div className="text-xs text-gray-500">
                              {toFixed2(p.percent)}% share
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {toFixed2(p.amount)} {token}
                          </div>
                          {currentPrice && (
                            <div className="text-xs text-gray-500">
                              ${toFixed2(p.amount * currentPrice)} USD
                              {token === 'ETH' && ethPrice.isStale && (
                                <span className="text-amber-600 ml-1">*</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">Add recipients and reach 100% to see distribution preview</p>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6">
              <button 
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
                onClick={() => setStep(1)}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Configuration
              </button>
              <button
                disabled={!canNextFromStep2()}
                className={`rounded-lg px-6 py-3 text-sm font-medium transition-all flex items-center gap-2 shadow-sm ${
                  canNextFromStep2() 
                    ? 'bg-[#0052FF] text-white hover:bg-[#0041CC] hover:shadow-md' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                onClick={() => setStep(3)}
              >
                Review & Deploy
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium">Review & Export Configuration</h2>
            <div className="rounded-lg border p-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-500">Name</dt>
                  <dd className="font-medium">{name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Network</dt>
                  <dd className="font-medium">{network}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Token</dt>
                  <dd className="font-medium">{token}</dd>
                </div>
              </dl>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Recipient</th>
                      <th className="px-3 py-2 text-left font-medium">% Share</th>
                      <th className="px-3 py-2 text-left font-medium">BPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map(r => {
                      const pct = Number(r.percent || '0');
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2">{r.input || '—'}</td>
                          <td className="px-3 py-2">{toFixed2(pct)}%</td>
                          <td className="px-3 py-2">{toBps(pct)} bps</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-gray-600">
                You will deploy a minimal proxy pointing to a verified PaymentSplitter implementation. Keep your config.json for audit.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <button className="rounded-md border px-4 py-2 text-sm" onClick={() => setStep(2)}>Back</button>
              <button
                className="rounded-md bg-black px-4 py-2 text-sm text-white"
                onClick={() => {
                  const config = {
                    name,
                    network,
                    token,
                    recipients: recipients.map(r => ({
                      address: r.input,
                      percent: Number(r.percent || '0'),
                      bps: toBps(Number(r.percent || '0'))
                    }))
                  };
                  
                  const configJson = JSON.stringify(config, null, 2);
                  const blob = new Blob([configJson], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-config.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  
                  alert(`Configuration saved! This is currently a configuration tool. Your ${name} split configuration has been downloaded as a JSON file. To deploy an actual smart contract, you'll need to use this configuration with a contract deployment service or implement the smart contract functionality.`);
                }}
              >
                Download Config
              </button>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t pt-6 space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  🔒 Safe & Secure
                </h3>
                <div className="mt-1 text-sm text-green-700">
                  <p>This tool only generates configuration files - no wallet connection required for basic use. Your private keys and funds remain completely safe.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Open Source</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>No Data Collection</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Client-side Only</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">💡 Pro Tip:</p>
              <p>Always test with small amounts first when implementing smart contracts.</p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

function CSVImporter({ onImport }: { onImport: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="relative">
      <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(o => !o)}>
        Bulk add (CSV)
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border bg-white p-3 shadow">
          <p className="mb-2 text-xs text-gray-600">Paste lines like:</p>
          <pre className="mb-2 rounded bg-gray-50 p-2 text-xs">{`0xabc...,50\nbrianna.eth,50`}</pre>
          <textarea ref={ref} className="h-28 w-full rounded border p-2 text-sm" placeholder="address,percent\naddress,percent" />
          <div className="mt-2 flex items-center justify-between">
            <button className="rounded-md border px-3 py-1 text-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="rounded-md bg-black px-3 py-1 text-sm text-white"
              onClick={() => {
                const text = ref.current?.value ?? '';
                onImport(text);
                setOpen(false);
              }}
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

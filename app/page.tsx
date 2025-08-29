'use client';
import React, { useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import { startPriceWS, getEthUsd, getMaticUsd } from './lib/coinbaseWS';
import { getFeeQuote, estimateUsd, formatGwei } from './lib/gas';
import { deploySplitter, getFactoryStatus } from './lib/deploy';
import { useAccount } from 'wagmi';

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
  
  // Live price and gas tracking
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [maticPrice, setMaticPrice] = useState<number | null>(null);
  const [gasGwei, setGasGwei] = useState<number | null>(null);
  const [gasUsd, setGasUsd] = useState<number | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<number>(0);
  
  // Wallet connection
  const { isConnected: walletConnected } = useAccount();
  
  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

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



  // Initialize price tracking
  React.useEffect(() => {
    startPriceWS();
    
    const updatePrices = () => {
      const ethUsd = getEthUsd();
      const maticUsd = getMaticUsd();
      
      if (ethUsd !== ethPrice) setEthPrice(ethUsd || null);
      if (maticUsd !== maticPrice) setMaticPrice(maticUsd || null);
      setLastPriceUpdate(Date.now());
    };
    
    const updateGas = async () => {
      try {
        const networkKey = network.toLowerCase() as 'ethereum' | 'polygon';
        const quote = await getFeeQuote(networkKey);
        const gwei = formatGwei(quote.max);
        setGasGwei(gwei);
        
        const { usd } = estimateUsd({
          gasUnits: 150000,
          maxFeePerGasWei: quote.max,
          network: networkKey
        });
        setGasUsd(usd || null);
      } catch {
        // Fallback estimates
        setGasGwei(network === 'Polygon' ? 50 : 25);
        setGasUsd(network === 'Polygon' ? 0.01 : 15);
      }
    };
    
    // Initial updates
    updatePrices();
    updateGas();
    
    // Regular updates
    const priceInterval = setInterval(updatePrices, 1000);
    const gasInterval = setInterval(updateGas, 10000);
    
    return () => {
      clearInterval(priceInterval);
      clearInterval(gasInterval);
    };
  }, [network, ethPrice, maticPrice]);

  // Get current price for calculations
  const currentPrice = token === 'ETH' ? ethPrice : (token === 'USDC' ? 1.0 : null);

  // Deploy splitter contract
  const deployContract = async () => {
    if (!walletConnected) {
      setDeployError('Please connect your wallet first');
      return;
    }

    if (!sumOk) {
      setDeployError('Total percentage must equal 100% before deploying');
      return;
    }

    try {
      setIsDeploying(true);
      setDeployError(null);

      const payees = recipients.map(r => r.input);
      const shares = recipients.map(r => toBps(Number(r.percent || '0')));

      const splitterAddress = await deploySplitter(name, payees, shares);
      setDeployResult(splitterAddress);

    } catch (error) {
      setDeployError(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <>
      <Header currentStep={step} totalSteps={3} />
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Network Status */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-gray-900">{network}</span>
            </div>

            {/* ETH Price */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ethPrice ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">ETH:</span>
                {ethPrice ? (
                  <span className="text-sm font-semibold text-gray-900">
                    ${ethPrice.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">Loading...</span>
                )}
              </div>
            </div>

            {/* Gas Price */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${gasGwei ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Gas:</span>
                {gasGwei ? (
                  <span className="text-sm font-medium text-gray-900">
                    {gasGwei.toFixed(1)} gwei
                    {gasUsd && ` • $${gasUsd.toFixed(4)}`}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">Loading...</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Updated {Math.floor((Date.now() - lastPriceUpdate) / 1000)}s ago
          </div>
        </div>
      </div>
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
                        <span className="font-medium text-gray-900">
                          {gasUsd ? `$${gasUsd.toFixed(4)}` : (
                            network === 'Polygon' ? '~$0.01' :
                            network === 'Arbitrum' ? '~$0.50' : 
                            '~$15-50'
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {network === 'Polygon' && 'Low fees, fast transactions. Great for frequent splits.'}
                      {network === 'Ethereum' && 'Most secure and decentralized, but higher fees.'}
                      {network === 'Arbitrum' && 'Layer 2 solution with lower fees than Ethereum.'}
                    </p>
                    {!gasUsd && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Loading live gas estimates...
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
                          ethPrice ? (
                            <span className="font-medium text-gray-900">
                              ${ethPrice.toFixed(2)}
                            </span>
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
                      {token === 'ETH' && ethPrice && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                          Live price
                        </span>
                      )}
                    </div>
                    {token === 'ETH' && !ethPrice && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Loading live price data...
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
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-slide-up">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Deploy Your Payment Splitter</h2>
              
              {/* Configuration Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Configuration Summary</h3>
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
                
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Recipients ({recipients.length})</h4>
                  <div className="space-y-2">
                    {recipients.map((r, i) => {
                      const pct = Number(r.percent || '0');
                      return (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{r.input || `Recipient ${i + 1}`}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{toFixed2(pct)}%</span>
                            <span className="text-gray-500">({toBps(pct)} bps)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Factory Status Check */}
              {walletConnected && (() => {
                try {
                  const { chainId } = { chainId: 137 }; // Default to Polygon for now
                  const factoryStatus = getFactoryStatus(chainId);
                  
                  if (!factoryStatus.available) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center gap-2">
                          <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-amber-800">Development Phase</p>
                            <p className="text-sm text-amber-700">{factoryStatus.message}</p>
                            <p className="text-xs text-amber-600 mt-1">You can still download the configuration for future deployment.</p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                } catch {
                  // Ignore errors for now
                }
                return null;
              })()}

              {/* Wallet Connection Status */}
              {!walletConnected ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Wallet Required</p>
                      <p className="text-sm text-blue-700">Connect your wallet to deploy the smart contract</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-green-800">Wallet Connected</p>
                      <p className="text-sm text-green-700">Ready to deploy to {network}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Deployment Cost Estimate */}
              {walletConnected && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-yellow-800 mb-2">Estimated Deployment Cost</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-yellow-700">Gas Estimate:</span>
                      <span className="font-medium ml-2">~150,000 gas</span>
                    </div>
                    <div>
                      <span className="text-yellow-700">Network Fee:</span>
                      <span className="font-medium ml-2">
                        {gasUsd ? `$${gasUsd.toFixed(4)}` : (
                          network === 'Polygon' ? '~$0.01' : 
                          network === 'Arbitrum' ? '~$0.50' : 
                          '~$15-50'
                        )}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-yellow-700 mt-2">
                    Actual cost depends on network congestion. This creates a permanent, immutable contract.
                  </p>
                </div>
              )}

              {/* Error State */}
              {deployError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-red-800">Deployment Failed</p>
                      <p className="text-sm text-red-700">{deployError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Success State */}
              {deployResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <h3 className="text-lg font-semibold text-green-800">Contract Deployed Successfully!</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-green-800">Splitter Contract Address:</label>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 p-2 bg-white rounded border font-mono text-sm">
                          {deployResult}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(deployResult)}
                          className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <a 
                        href={`https://${network.toLowerCase() === 'polygon' ? 'polygonscan.com' : network.toLowerCase() === 'arbitrum' ? 'arbiscan.io' : 'etherscan.io'}/address/${deployResult}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View on {network === 'Polygon' ? 'PolygonScan' : network === 'Arbitrum' ? 'Arbiscan' : 'Etherscan'}
                      </a>
                      
                      <a 
                        href="/manage"
                        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                        Manage Contracts
                      </a>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800 font-medium">How to use your splitter:</p>
                      <ul className="text-sm text-blue-700 mt-1 space-y-1">
                        <li>• Send {token} to the contract address above</li>
                        <li>• Funds are automatically split according to your percentages</li>
                        <li>• Recipients can claim their shares anytime</li>
                        <li>• Use the Manage page to fund and release payments</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation and Deploy */}
            <div className="flex items-center justify-between pt-6">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
                onClick={() => setStep(2)}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Recipients
              </button>
              
              <div className="flex items-center gap-3">
                {/* Download Config Button (Secondary) */}
                <button
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
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
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Config
                </button>

                {/* Deploy Contract Button (Primary) */}
                <button
                  disabled={!walletConnected || isDeploying || !sumOk}
                  className={`rounded-lg px-6 py-3 text-sm font-medium transition-all flex items-center gap-2 shadow-sm ${
                    walletConnected && !isDeploying && sumOk
                      ? 'bg-[#0052FF] text-white hover:bg-[#0041CC] hover:shadow-md' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={deployContract}
                >
                  {isDeploying ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deploying Contract...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Deploy Smart Contract
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
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

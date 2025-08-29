'use client';
import React, { useMemo, useRef, useState } from 'react';
import Header from './components/Header';

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
  const [usdPrice] = useState<number | null>(3200);

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

  return (
    <>
      <Header currentStep={step} totalSteps={3} />
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
                      <span className="font-medium text-gray-900">
                        {network === 'Polygon' && '~$0.01'}
                        {network === 'Ethereum' && '~$15-50'}
                        {network === 'Arbitrum' && '~$0.50'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {network === 'Polygon' && 'Low fees, fast transactions. Great for frequent splits.'}
                      {network === 'Ethereum' && 'Most secure and decentralized, but higher fees.'}
                      {network === 'Arbitrum' && 'Layer 2 solution with lower fees than Ethereum.'}
                    </p>
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
                      <span className="font-medium text-gray-900">
                        {token === 'ETH' && '$3,200'}
                        {token === 'USDC' && '$1.00'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {token === 'ETH' && 'Native token, widely accepted across DeFi.'}
                      {token === 'USDC' && 'Stable value pegged to USD, great for predictable splits.'}
                    </p>
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
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Recipients & Shares</h2>
              {sumChip}
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Address or ENS</th>
                    <th className="px-3 py-2 text-left font-medium">% Share</th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r, i) => {
                    const { hint } = normalizeAddressOrENS(r.input);
                    const keyLower = (r.address || r.input.trim()).toLowerCase();
                    const isDup = keyLower && duplicateAddresses.has(keyLower);
                    const pct = Number(r.percent || '0');
                    const pctValid = isFinite(pct) && pct >= 0 && pct <= 100;

                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                            placeholder="0x... or name.eth"
                            value={r.input}
                            onChange={e => updateRecipient(r.id, { input: e.target.value })}
                            aria-label={`Recipient ${i + 1} address or ENS`}
                          />
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-gray-500">{hint}</span>
                            {isDup && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Duplicate</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={`w-32 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 ${
                              pctValid ? 'focus:ring-black' : 'border-red-400 focus:ring-red-500'
                            }`}
                            placeholder="0.00"
                            inputMode="decimal"
                            value={r.percent}
                            onChange={e => {
                              const v = e.target.value.replace(/[^0-9.]/g, '');
                              updateRecipient(r.id, { percent: v });
                              if (i === recipients.length - 1) setTimeout(autoBalanceLast, 0);
                            }}
                            aria-label={`Recipient ${i + 1} percent`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="rounded-md border px-2 py-1"
                            onClick={() => removeRow(r.id)}
                            aria-label={`Remove recipient ${i + 1}`}
                            disabled={recipients.length === 1}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex items-center justify-between px-3 py-3">
                <button className="rounded-md border px-3 py-2 text-sm" onClick={addRow}>
                  + Add recipient
                </button>
                <CSVImporter onImport={handleCSVImport} />
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Payout preview</h3>
                  <p className="text-xs text-gray-500">Enter a test amount to see per-recipient payouts. USD uses a cached price.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm">Test amount ({token})</label>
                  <input
                    className="w-28 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                    value={testAmount}
                    onChange={e => setTestAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                </div>
              </div>

              {!sumOk && <p className="mb-2 text-sm text-amber-700">The total must be exactly 100.00%. Adjust your shares.</p>}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Recipient</th>
                      <th className="px-3 py-2 text-left font-medium">% Share</th>
                      <th className="px-3 py-2 text-left font-medium">{token} Amount</th>
                      <th className="px-3 py-2 text-left font-medium">USD (approx)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">{p.input || '—'}</td>
                        <td className="px-3 py-2">{toFixed2(p.percent)}%</td>
                        <td className="px-3 py-2">{toFixed2(p.amount)} {token}</td>
                        <td className="px-3 py-2">{usdPrice ? `$${toFixed2(p.amount * usdPrice)}` : <span title="No price feed">—</span>}</td>
                      </tr>
                    ))}
                    {preview.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-gray-500" colSpan={4}>Add recipients and reach 100% to see preview.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button className="rounded-md border px-4 py-2 text-sm" onClick={() => setStep(1)}>Back</button>
              <button
                disabled={!canNextFromStep2()}
                className={`rounded-md px-4 py-2 text-sm text-white ${canNextFromStep2() ? 'bg-black' : 'bg-gray-400'}`}
                onClick={() => setStep(3)}
              >
                Review
              </button>
            </div>
          </section>
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

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
      <Header />
      <main>
        <section className="mb-6">
          <p className="text-sm text-gray-600">
            Route any incoming {token} on {network} to teammates by fixed percentages. Always test with a small amount first.
          </p>
        </section>

        <ol className="mb-6 flex items-center gap-3 text-sm">
          <li className={`rounded-full px-3 py-1 ${step === 1 ? 'bg-black text-white' : 'bg-gray-100'}`}>1. Basics</li>
          <li className={`rounded-full px-3 py-1 ${step === 2 ? 'bg-black text-white' : 'bg-gray-100'}`}>2. Recipients</li>
          <li className={`rounded-full px-3 py-1 ${step === 3 ? 'bg-black text-white' : 'bg-gray-100'}`}>3. Review & Deploy</li>
        </ol>

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium">Splitter name</label>
              <input
                id="name"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Design Team Splitter"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">Shown on the dashboard & receipts.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Network</label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  value={network}
                  onChange={e => setNetwork(e.target.value as 'Polygon' | 'Ethereum' | 'Arbitrum')}
                >
                  <option>Polygon</option>
                  <option>Ethereum</option>
                  <option>Arbitrum</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Use a low-fee chain to improve UX.</p>
              </div>

              <div>
                <label className="block text-sm font-medium">Token</label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  value={token}
                  onChange={e => setToken(e.target.value as 'ETH' | 'USDC')}
                >
                  <option>ETH</option>
                  <option>USDC</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Start with ETH or USDC only; add more later.</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                className="rounded-md border px-4 py-2 text-sm"
                onClick={() => handleCSVImport('0x0000000000000000000000000000000000000001,50\n0x0000000000000000000000000000000000000002,50')}
              >
                Try sample recipients
              </button>
              <button
                disabled={!canNextFromStep1()}
                className={`rounded-md px-4 py-2 text-sm text-white ${canNextFromStep1() ? 'bg-black' : 'bg-gray-400'}`}
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </div>
          </section>
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
            <h2 className="text-lg font-medium">Review & Deploy</h2>
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
                onClick={() => alert('UI mock only — wire Wagmi contract calls next.')}
              >
                Deploy
              </button>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t pt-4 text-xs text-gray-500">
          Tip: start on a testnet and do a $0.10 test deposit before any real funds.
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

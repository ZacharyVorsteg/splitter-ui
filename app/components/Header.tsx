'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Header() {
  return (
    <header className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Payment Splitter</h1>
      <ConnectButton />
    </header>
  );
}

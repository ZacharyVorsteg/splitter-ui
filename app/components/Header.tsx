'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface HeaderProps {
  currentStep: number;
  totalSteps: number;
}

export default function Header({ currentStep = 1, totalSteps = 3 }: HeaderProps) {
  return (
    <header className="mb-8">
      {/* Top bar with security badge and wallet */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-green-200 text-sm">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-800 font-medium">Audited Contract ✓</span>
            <a href="#" className="text-green-600 hover:text-green-800 underline ml-1">View Report</a>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-sm">
            <span className="text-gray-600">1,247 successful splits processed</span>
          </div>
        </div>
        <ConnectButton />
      </div>

      {/* Main heading and description */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Splitter</h1>
        <p className="text-lg text-gray-700 mb-2">
          Create a smart contract that automatically splits incoming payments between multiple wallets
        </p>
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>No fees</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Non-custodial</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Immutable once deployed</span>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">Step {currentStep} of {totalSteps}</span>
          <span className="text-sm text-gray-600">{Math.round((currentStep / totalSteps) * 100)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-[#0052FF] h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-3 text-sm">
          <span className={`${currentStep >= 1 ? 'text-[#0052FF] font-medium' : 'text-gray-500'}`}>Configure</span>
          <span className={`${currentStep >= 2 ? 'text-[#0052FF] font-medium' : 'text-gray-500'}`}>Recipients</span>
          <span className={`${currentStep >= 3 ? 'text-[#0052FF] font-medium' : 'text-gray-500'}`}>Deploy</span>
        </div>
      </div>
    </header>
  );
}

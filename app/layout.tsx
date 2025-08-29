import './globals.css';
import { Providers } from './providers';
import ErrorBoundary from './components/ErrorBoundary';

export const metadata = {
  title: 'Payment Splitter | Split Crypto Payments Automatically',
  description: 'Create smart contracts to automatically split cryptocurrency payments among team members. Support for Ethereum, Polygon, and Arbitrum networks with ETH and USDC.',
  keywords: 'crypto payment splitter, ethereum payment split, team payments, cryptocurrency distribution, smart contract payments, DeFi payments',
  authors: [{ name: 'Payment Splitter Team' }],
  creator: 'Payment Splitter',
  publisher: 'Payment Splitter',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://splitter-ui.netlify.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Payment Splitter | Split Crypto Payments Automatically',
    description: 'Create smart contracts to automatically split cryptocurrency payments among team members. Support for Ethereum, Polygon, and Arbitrum networks.',
    url: 'https://splitter-ui.netlify.app',
    siteName: 'Payment Splitter',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Payment Splitter - Split Crypto Payments Automatically',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Payment Splitter | Split Crypto Payments Automatically',
    description: 'Create smart contracts to automatically split cryptocurrency payments among team members.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-site-verification-code',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <ErrorBoundary>
          <div className="mx-auto max-w-5xl px-6 py-8">
            <Providers>{children}</Providers>
          </div>
        </ErrorBoundary>
      </body>
    </html>
  );
}

import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Payment Splitter',
  description: 'Route funds to teammates by fixed percentages',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}

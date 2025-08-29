# Payment Splitter

A complete DeFi application for deploying and managing smart contracts that automatically split cryptocurrency payments among team members. Built with Next.js, Tailwind CSS, RainbowKit/Wagmi, and OpenZeppelin contracts.

## Features

- 🚀 **Smart Contract Deployment**: Deploy real PaymentSplitter contracts to Polygon and Ethereum
- 💰 **Multi-token support**: Split ETH, MATIC, USDC, and other ERC20 tokens
- 👥 **Team management**: Add multiple recipients with custom percentages
- 📊 **Real-time pricing**: Live ETH and MATIC prices via Coinbase WebSocket
- ⛽ **Live gas tracking**: Real-time gas estimates using eth_feeHistory
- 🔗 **Multi-chain support**: Polygon (low fees), Ethereum, and Arbitrum networks
- 📱 **Responsive design**: Works perfectly on desktop and mobile devices
- 🔒 **Non-custodial**: Your keys, your contracts, your control

## How It Works

1. **Configure**: Set up your payment split with recipient addresses and percentages
2. **Deploy**: Connect your wallet and deploy a real smart contract to the blockchain  
3. **Fund**: Send cryptocurrency to the contract address
4. **Distribute**: Recipients can claim their shares anytime, or use batch release

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

### Environment Setup

1. Copy the environment example:
```bash
cp env.example .env.local
```

2. Get a WalletConnect Project ID:
   - Visit [WalletConnect Cloud](https://cloud.walletconnect.com/)
   - Create a free account and new project
   - Copy your Project ID to `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

### Production Deployment

#### Deploy to Netlify

1. **Push to GitHub**: Ensure your code is committed and pushed
2. **Connect to Netlify**:
   - Go to [Netlify](https://netlify.com) and sign in
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository
3. **Configure build settings**:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: 18+
4. **Environment variables**:
   - Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in Netlify dashboard
5. **Deploy**: Netlify will automatically build and deploy your site

The `netlify.toml` file is included for optimal configuration.

#### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Project Structure

```
splitter-ui/
├── app/
│   ├── components/
│   │   ├── Header.tsx          # Navigation with wallet connection
│   │   └── ErrorBoundary.tsx   # Error handling
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout with metadata
│   ├── page.tsx                # Main application logic
│   └── providers.tsx           # Web3 providers setup
├── public/                     # Static assets
├── netlify.toml               # Netlify deployment config
└── package.json               # Dependencies and scripts
```

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS 4
- **Web3**: Wagmi + RainbowKit for wallet connections
- **TypeScript**: Full type safety
- **Deployment**: Optimized for Netlify and Vercel

## Usage

1. **Configure basics**: Set splitter name, network, and token
2. **Add recipients**: Input wallet addresses or ENS names with percentages
3. **Review setup**: Verify all details and percentages sum to 100%
4. **Export configuration**: Download a JSON file with your payment split configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Security

- Always test with small amounts first
- Use testnets for development
- Verify recipient addresses carefully
- Keep your private keys secure

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review the code comments
# mpp-skill

Machine Payments Protocol (MPP) skill for ClaudeHub/OpenClaw agents.

Subscribe to Mobula MPP plans, check status, fetch crypto prices, wallet data, and execute trades.

## Installation

### For ClaudeHub/OpenClaw Agents

Add this skill to your agent by cloning it into your skills directory:

```bash
cd ~/your-agent/skills/
git clone https://github.com/Flotapponnier/mpp-skill.git mpp
```

### Standalone CLI Usage

```bash
git clone https://github.com/Flotapponnier/mpp-skill.git
cd mpp-skill
bun run start help
```

## Quick Start

```bash
# Subscribe to MPP startup plan
bun run start subscribe startup monthly

# Check your subscription status
bun run start status

# Get Bitcoin price
bun run start price bitcoin

# Get trending tokens
bun run start lighthouse
```

## Usage

See [SKILL.md](./SKILL.md) for complete documentation and agent integration examples.

## Features

- 💳 **Subscription management** - startup, growth, enterprise plans with monthly/yearly billing
- 💰 **Credit top-ups** - Add credits to your account ($10-$10,000)
- 🔑 **API key management** - Create and revoke API keys
- 📊 **Real-time crypto prices** - Get token prices for any asset
- 👛 **Wallet position tracking** - Analyze wallet holdings and positions
- 🔥 **Trending token discovery** - Find what's hot in crypto markets

## Project Structure

```
mpp-skill/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── wallet.ts          # Secure wallet management (AES-256-GCM encrypted)
│   ├── commands/
│   │   └── mpp.ts         # Command handler
│   └── mpp/
│       ├── mpp-client.ts  # Main MPP client
│       ├── x402-client.ts # X402 protocol client
│       ├── tempo-client.ts # Tempo protocol client
│       ├── trading.ts     # Trading utilities
│       └── user-mpp.ts    # User MPP utilities
├── SKILL.md               # Skill documentation
├── package.json
└── README.md
```

## Requirements

- Bun >= 1.0.0

## License

MIT

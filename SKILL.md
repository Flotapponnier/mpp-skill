---
description: Subscribe to Mobula MPP plans, check status, fetch crypto prices, wallet data, and execute trades
---

# MPP (Machine Payments Protocol) Skill

You have access to Mobula's MPP (Machine Payments Protocol) for crypto market data and trading.

## Available Tools

You can use the Bash tool to execute these MPP commands:

### Subscription Management

```bash
# Subscribe to a plan (startup, growth, or enterprise)
bun src/index.ts mpp subscribe startup monthly

# Check subscription status and credits
bun src/index.ts mpp status

# Top up credits ($10-$10,000)
bun src/index.ts mpp topup 50

# Create new API key
bun src/index.ts mpp key-create

# Revoke API key
bun src/index.ts mpp key-revoke <api-key>
```

### Market Data

```bash
# Get token price
bun src/index.ts mpp price bitcoin
bun src/index.ts mpp price ethereum

# Get wallet positions
bun src/index.ts mpp wallet 0x1234...

# Get trending tokens
bun src/index.ts mpp lighthouse
```

### Configuration

```bash
# Show current MPP config
bun src/index.ts mpp config
```

## How to Use

When a user asks about crypto prices, market data, or wants to subscribe to MPP:

1. **For subscriptions**: Use `bun src/index.ts mpp subscribe <plan> <frequency>`
2. **For price checks**: Use `bun src/index.ts mpp price <asset>`
3. **For wallet analysis**: Use `bun src/index.ts mpp wallet <address>`
4. **For trending tokens**: Use `bun src/index.ts mpp lighthouse`

## Example Interactions

**User**: "Subscribe me to MPP startup plan"
**You**: Execute `bun src/index.ts mpp subscribe startup monthly` and show the API key and agent ID.

**User**: "What's the price of Bitcoin?"
**You**: Execute `bun src/index.ts mpp price bitcoin` and format the response nicely.

**User**: "Show me what's trending"
**You**: Execute `bun src/index.ts mpp lighthouse` and present the trending tokens.

**User**: "Check my subscription status"
**You**: Execute `bun src/index.ts mpp status` and show the plan, credits, and days left.

## Important Notes

- Config is stored in `.claude/claudeclaw/mpp/config.json`
- Always use the Bash tool to execute these commands
- Format the JSON responses nicely for the user
- If subscription fails, guide user to create an account on admin.mobula.io first

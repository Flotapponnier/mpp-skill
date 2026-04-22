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
bun run start subscribe startup monthly

# Check subscription status and credits
bun run start status

# Top up credits ($10-$10,000)
bun run start topup 50

# Create new API key
bun run start key-create

# Revoke API key
bun run start key-revoke <api-key>
```

### Market Data

```bash
# Get token price
bun run start price bitcoin
bun run start price ethereum

# Get wallet positions
bun run start wallet 0x1234...

# Get trending tokens
bun run start lighthouse
```

### Configuration

```bash
# Show current MPP config
bun run start config
```

## How to Use

When a user asks about crypto prices, market data, or wants to subscribe to MPP:

1. **For subscriptions**: Use `bun run start subscribe <plan> <frequency>`
2. **For price checks**: Use `bun run start price <asset>`
3. **For wallet analysis**: Use `bun run start wallet <address>`
4. **For trending tokens**: Use `bun run start lighthouse`

Alternatively, if installed in your agent's working directory:

1. **For subscriptions**: Use `bun src/index.ts subscribe <plan> <frequency>`
2. **For price checks**: Use `bun src/index.ts price <asset>`
3. **For wallet analysis**: Use `bun src/index.ts wallet <address>`
4. **For trending tokens**: Use `bun src/index.ts lighthouse`

## Example Interactions

**User**: "Subscribe me to MPP startup plan"
**You**: Execute `bun run start subscribe startup monthly` and show the API key and agent ID.

**User**: "What's the price of Bitcoin?"
**You**: Execute `bun run start price bitcoin` and format the response nicely.

**User**: "Show me what's trending"
**You**: Execute `bun run start lighthouse` and present the trending tokens.

**User**: "Check my subscription status"
**You**: Execute `bun run start status` and show the plan, credits, and days left.

## Important Notes

- Config is stored in `.claude/claudeclaw/mpp/config.json`
- Always use the Bash tool to execute these commands
- Format the JSON responses nicely for the user
- If subscription fails, guide user to create an account on admin.mobula.io first

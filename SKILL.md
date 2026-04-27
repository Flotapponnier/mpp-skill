---
description: Pay-as-you-go Mobula API access — fetch crypto prices, wallet positions, and market data using a Tempo wallet that pays per call (~$0.0004) in USDC.e. No subscription, no API key.
---

# MPP (Machine Payments Protocol) Skill

Mobula's MPP API is **pay-per-call** : every request is settled on-chain from your own wallet using USDC.e on the Tempo chain (chainId 4217). No signup, no API key — just a funded wallet.

This skill gives you (the agent) everything needed to:
1. Generate a Tempo wallet,
2. Top it up via the public bridge,
3. Make Mobula API calls and pay per-call automatically.

## Setup (one-time, ~2 min)

```bash
# 1. Clone the skill (skip if already installed in your skills dir)
git clone https://github.com/Flotapponnier/mpp-skill.git
cd mpp-skill
bun install

# 2. Create a hot wallet (stored at ~/.mpp-skill/wallet.json, chmod 600)
bun run start wallet-create
# → prints address + bridge link

# 3. Fund the wallet with USDC.e on Tempo
#    Open: https://relay.link/bridge/tempo?toAddress=<your-address>
#    Bridge a few dollars of USDC from any chain (Base, Ethereum, …).
#    Tempo's gas token IS USDC, so $1 of USDC.e is enough to make ~2,500 calls.

# 4. Verify the balance
bun run start balance
```

Once funded, every subsequent call is automatic — no manual signing.

## CLI commands

| Command | What it does |
|---|---|
| `bun run start wallet-create` | Generate a new Tempo wallet (won't overwrite an existing one) |
| `bun run start balance` | Show wallet address, USDC.e balance, bridge link |
| `bun run start price <asset>` | Token price — accepts name, symbol, or contract address |
| `bun run start wallet <addr>` | Wallet portfolio positions |
| `bun run start lighthouse` | Trending tokens |
| `bun run start call <path> k=v…` | Generic call to any `/api/2/*` endpoint |

Examples:

```bash
bun run start price bitcoin
bun run start price 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
bun run start wallet 0xd04b77bb40944110ec9c9e3165f67dadf9d52f21
bun run start lighthouse
bun run start call /api/2/wallet/activity wallet=0xabc...
```

## Programmatic use (inside an agent)

Import directly from your TypeScript code — useful when each end-user has their own wallet (e.g. a Telegram bot where each Telegram ID gets a per-user encrypted wallet).

### Per-user wallets (multi-tenant agents)

```ts
import { createUserWallet, getUserWalletAddress } from "mpp-skill/src/wallet";
import { userMobulaCall, getUserTempoBalance } from "mpp-skill/src/mpp/user-mpp";

// On first interaction with a Telegram user
const userId = 1162998296;  // Telegram numeric ID
let address = await getUserWalletAddress(userId);
if (!address) {
  const w = await createUserWallet(userId);
  address = w.address;
  // Tell the user to fund it:
  // https://relay.link/bridge/tempo?toAddress=${address}
}

// Check funds
const bal = await getUserTempoBalance(userId);
console.log(`User has $${bal?.usd ?? 0} USDC.e on Tempo`);

// Make an API call (paid from the user's own wallet)
const price = await userMobulaCall(userId, "/api/2/token/price", { asset: "bitcoin" });
```

Per-user wallets are stored at `.claude/claudeclaw/wallets/{userId}.json`, AES-256-GCM encrypted with a key derived from `HMAC-SHA256(WALLET_SECRET, userId)`. The secret is auto-generated once at `.claude/claudeclaw/wallet.secret` (chmod 600). Different users cannot decrypt each other's keys.

### Direct low-level call

If you already have a private key and want full control:

```ts
import { tempoFetch } from "mpp-skill/src/mpp/tempo-client";
import type { Hex } from "viem";

const data = await tempoFetch(
  "/api/2/token/price",
  { asset: "ethereum" },
  process.env.TEMPO_PRIVATE_KEY as Hex,
);
```

## How the payment works (under the hood)

1. Agent calls `GET https://mpp.mobula.io/api/2/token/price?asset=bitcoin` with no auth.
2. Server returns **HTTP 402** with `WWW-Authenticate: Payment id="…", realm="mpp.mobula.io", method="tempo", request="<base64-json>"`. The decoded request specifies `amount` (in USDC.e atoms), `currency: USDC.e`, `recipient`, `methodDetails.chainId: 4217`.
3. Skill signs and broadcasts `transferWithMemo(recipient, amount, challengeId)` on USDC.e (`0x20c000000000000000000000b9537d11c60e8b50`) on Tempo.
4. Skill retries the same request with `Authorization: Payment <base64url(credential)>`, where `credential` references the tx hash.
5. Server validates the tx and returns the data.

The skill does steps 2–4 automatically — agents only see the data response.

## Key facts

- **Chain**: Tempo (chainId `4217`, RPC `https://rpc.tempo.xyz`)
- **Token**: USDC.e (`0x20c000000000000000000000b9537d11c60e8b50`)
- **Gas**: paid in USDC (Tempo uses USDC as native gas token — no separate ETH needed)
- **Cost per call**: ~$0.0004 typical, never above the amount specified in the 402 challenge
- **Bridge**: https://relay.link/bridge/tempo — bridges from Base, Ethereum, Arbitrum, etc.

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `No wallet found` | First-time setup not done | `bun run start wallet-create` |
| `Insufficient Tempo balance: you have $0.0000…` | Wallet not funded yet | Bridge USDC.e via the printed link |
| `Could not parse challenge from: …` | Server didn't return a Tempo `WWW-Authenticate` header | Likely an upstream issue — retry or report |
| `Tempo tx failed: …` | RPC error or revert on-chain | Check balance and `https://explorer.tempo.xyz` for the address |

## When to use this vs a subscription

Mobula's subscription endpoints (`/agent/x402/subscribe`, etc.) are **not currently configured** in production. Until they are, this pay-per-call flow is the only way to call MPP API endpoints from an agent. The CLI returns a clear error if you try the legacy `subscribe` / `status` / `topup` / `key-create` commands.

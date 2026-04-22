/**
 * MPP (Machine Payments Protocol) command
 * Manage Mobula API subscriptions and fetch market data
 */

import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { MppClient, type MppSubscription } from "../mpp/mpp-client";

const MPP_CONFIG_DIR = join(process.cwd(), ".claude", "claudeclaw", "mpp");
const MPP_CONFIG_FILE = join(MPP_CONFIG_DIR, "config.json");

interface MppStoredConfig {
  apiKey?: string;
  agentId?: string;
  baseUrl?: string;
}

/**
 * Load MPP config from disk
 */
function loadMppConfig(): MppStoredConfig {
  try {
    if (existsSync(MPP_CONFIG_FILE)) {
      const content = Bun.file(MPP_CONFIG_FILE).text();
      return JSON.parse(content) as MppStoredConfig;
    }
  } catch (error) {
    console.error("Failed to load MPP config:", error);
  }
  return {};
}

/**
 * Save MPP config to disk
 */
async function saveMppConfig(config: MppStoredConfig): Promise<void> {
  try {
    if (!existsSync(MPP_CONFIG_DIR)) {
      mkdirSync(MPP_CONFIG_DIR, { recursive: true });
    }
    await Bun.write(MPP_CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch (error) {
    console.error("Failed to save MPP config:", error);
    throw error;
  }
}

/**
 * Format subscription info for display
 */
function formatSubscription(sub: MppSubscription): string {
  const status = sub.plan_active ? "✓ Active" : "✗ Inactive";
  const planEmoji = sub.plan === "Enterprise" ? "🚀" : sub.plan === "Growth" ? "📈" : "🌱";

  return `
${planEmoji} MPP Subscription Status

Plan: ${sub.plan} (${sub.payment_frequency})
Status: ${status}
Days Left: ${sub.left_days}
Credits Left: ${sub.credits_left.toLocaleString()}

Agent ID: ${sub.user_id}
API Keys: ${sub.api_keys.length} active
Last Payment: ${sub.last_payment ? new Date(sub.last_payment).toLocaleDateString() : "Never"}
`.trim();
}

/**
 * Main MPP command handler
 */
export async function mppCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  // Load saved config
  const storedConfig = loadMppConfig();
  const client = new MppClient(storedConfig);

  try {
    switch (subcommand) {
      case "subscribe": {
        const [plan, frequency = "monthly"] = rest;
        if (!plan || !["startup", "growth", "enterprise"].includes(plan.toLowerCase())) {
          console.error("Usage: mpp subscribe <startup|growth|enterprise> [monthly|yearly]");
          console.error("\nPlans:");
          console.error("  🌱 startup    - For individual developers");
          console.error("  📈 growth     - For growing teams");
          console.error("  🚀 enterprise - For large organizations");
          process.exit(1);
        }

        console.log(`Subscribing to ${plan} plan (${frequency})...`);
        const creds = await client.subscribe(
          plan.toLowerCase() as any,
          frequency.toLowerCase() as any
        );

        await saveMppConfig({
          ...storedConfig,
          apiKey: creds.api_key,
          agentId: creds.user_id,
        });

        console.log("\n✓ Successfully subscribed!");
        console.log(`Agent ID: ${creds.user_id}`);
        console.log(`API Key: ${creds.api_key.substring(0, 8)}...`);
        console.log("\nConfig saved to:", MPP_CONFIG_FILE);
        break;
      }

      case "status": {
        if (!client.getApiKey()) {
          console.error("No API key found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        const sub = await client.getSubscription();
        console.log(formatSubscription(sub));
        break;
      }

      case "topup": {
        const [amountStr] = rest;
        const amount = parseFloat(amountStr);

        if (!client.getAgentId()) {
          console.error("No agent ID found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        if (!amountStr || isNaN(amount) || amount < 10 || amount > 10000) {
          console.error("Usage: mpp topup <amount>");
          console.error("Amount must be between $10 and $10,000");
          process.exit(1);
        }

        console.log(`Topping up $${amount}...`);
        const result = await client.topUp(client.getAgentId()!, amount);

        console.log("\n✓ Top-up successful!");
        console.log(`Credits added: ${result.credits_added.toLocaleString()}`);
        console.log(`New credits limit: ${result.new_credits_limit.toLocaleString()}`);
        break;
      }

      case "key-create": {
        if (!client.getApiKey()) {
          console.error("No API key found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        const creds = await client.createApiKey();
        console.log("\n✓ New API key created!");
        console.log(`API Key: ${creds.api_key}`);
        console.log(`Agent ID: ${creds.user_id}`);
        break;
      }

      case "key-revoke": {
        const [keyToRevoke] = rest;
        if (!keyToRevoke) {
          console.error("Usage: mpp key-revoke <api-key>");
          process.exit(1);
        }

        await client.revokeApiKey(keyToRevoke);
        console.log("✓ API key revoked successfully");
        break;
      }

      case "price": {
        const [asset] = rest;
        if (!asset) {
          console.error("Usage: mpp price <asset>");
          console.error("Example: mpp price bitcoin");
          process.exit(1);
        }

        if (!client.getApiKey()) {
          console.error("No API key found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        const data = await client.getTokenPrice(asset);
        console.log(`\n💰 ${asset.toUpperCase()} Price:`);
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "wallet": {
        const [address] = rest;
        if (!address) {
          console.error("Usage: mpp wallet <address>");
          console.error("Example: mpp wallet 0x...");
          process.exit(1);
        }

        if (!client.getApiKey()) {
          console.error("No API key found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        const positions = await client.getWalletPositions(address);
        console.log(`\n👛 Wallet ${address}:`);
        console.log(JSON.stringify(positions, null, 2));
        break;
      }

      case "lighthouse": {
        if (!client.getApiKey()) {
          console.error("No API key found. Subscribe first with: mpp subscribe <plan>");
          process.exit(1);
        }

        const data = await client.getMarketLighthouse();
        console.log("\n🔥 Trending Tokens:");
        console.log(JSON.stringify(data, null, 2));
        break;
      }

      case "config": {
        console.log("MPP Configuration:");
        console.log(`Config file: ${MPP_CONFIG_FILE}`);
        console.log(`\nStored settings:`);
        console.log(`  API Key: ${storedConfig.apiKey ? storedConfig.apiKey.substring(0, 8) + "..." : "Not set"}`);
        console.log(`  Agent ID: ${storedConfig.agentId || "Not set"}`);
        console.log(`  Base URL: ${storedConfig.baseUrl || "https://api.mobula.io (default)"}`);
        break;
      }

      case "help":
      default: {
        console.log(`
MPP (Machine Payments Protocol) - Mobula API Client

Usage: claudeclaw mpp <command> [options]

Commands:
  subscribe <plan> [freq]  Subscribe to an MPP plan
                           Plans: startup, growth, enterprise
                           Frequency: monthly (default), yearly

  status                   Show subscription status and credits

  topup <amount>          Top up credits ($10 - $10,000)

  key-create              Create a new API key
  key-revoke <key>        Revoke an API key

  price <asset>           Get token price
                          Example: mpp price bitcoin

  wallet <address>        Get wallet positions
                          Example: mpp wallet 0x...

  lighthouse              Get trending tokens

  config                  Show current configuration

  help                    Show this help message

Examples:
  claudeclaw mpp subscribe startup monthly
  claudeclaw mpp status
  claudeclaw mpp topup 50
  claudeclaw mpp price ethereum
  claudeclaw mpp wallet 0x1234567890123456789012345678901234567890

For more info: https://docs.mobula.io
        `.trim());
        break;
      }
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exit(1);
  }
}

/**
 * Standalone CLI wallet for the `mpp` command.
 *
 * Stored at ~/.mpp-skill/wallet.json (chmod 600).
 * Plain JSON — this is a hot wallet on the user's own machine,
 * intended to hold a few dollars of USDC.e for pay-as-you-go API calls.
 *
 * For per-user wallets in a multi-tenant agent (e.g. Telegram bot),
 * use the encrypted helpers in `./wallet.ts` keyed by user ID.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, chmod } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export const CLI_WALLET_DIR = join(homedir(), ".mpp-skill");
export const CLI_WALLET_FILE = join(CLI_WALLET_DIR, "wallet.json");

export interface CliWallet {
  address: string;
  privateKey: Hex;
  createdAt: string;
}

export async function loadCliWallet(): Promise<CliWallet | null> {
  const f = Bun.file(CLI_WALLET_FILE);
  if (!(await f.exists())) return null;
  return JSON.parse(await f.text()) as CliWallet;
}

export async function createCliWallet(): Promise<CliWallet> {
  if (await Bun.file(CLI_WALLET_FILE).exists()) {
    throw new Error(
      `Wallet already exists at ${CLI_WALLET_FILE}. Delete it first to regenerate.`
    );
  }
  await mkdir(CLI_WALLET_DIR, { recursive: true });
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const record: CliWallet = {
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
  };
  await Bun.write(CLI_WALLET_FILE, JSON.stringify(record, null, 2));
  try {
    await chmod(CLI_WALLET_FILE, 0o600);
  } catch {}
  return record;
}

export async function requireCliWallet(): Promise<CliWallet> {
  const w = await loadCliWallet();
  if (!w) {
    console.error("No wallet found. Run: bun run start wallet-create");
    process.exit(1);
  }
  return w;
}

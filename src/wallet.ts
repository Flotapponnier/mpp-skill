/**
 * Secure per-user wallet management.
 *
 * Each user gets an isolated wallet file at:
 *   .claude/claudeclaw/wallets/{userId}.json
 *
 * The private key is AES-256-GCM encrypted with a key derived from:
 *   HMAC-SHA256(WALLET_SECRET, userId)
 * where WALLET_SECRET is a server-side secret loaded from env or generated once.
 *
 * No other user can decrypt another user's private key.
 */

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const WALLETS_DIR = join(process.cwd(), ".claude", "claudeclaw", "wallets");
const SECRET_FILE = join(process.cwd(), ".claude", "claudeclaw", "wallet.secret");

let _secret: Buffer | null = null;

async function getSecret(): Promise<Buffer> {
  if (_secret) return _secret;
  const f = Bun.file(SECRET_FILE);
  if (await f.exists()) {
    _secret = Buffer.from(await f.text(), "hex");
  } else {
    _secret = randomBytes(32);
    await Bun.write(SECRET_FILE, _secret.toString("hex"));
    // Restrict permissions
    try { execSync(`chmod 600 "${SECRET_FILE}"`); } catch {}
  }
  return _secret;
}

function deriveKey(secret: Buffer, userId: number): Buffer {
  return createHmac("sha256", secret).update(String(userId)).digest();
}

function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24hex) + tag(32hex) + ciphertext(hex)
  return iv.toString("hex") + tag.toString("hex") + enc.toString("hex");
}

function decrypt(key: Buffer, data: string): string {
  const iv = Buffer.from(data.slice(0, 24), "hex");
  const tag = Buffer.from(data.slice(24, 56), "hex");
  const enc = Buffer.from(data.slice(56), "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function walletPath(userId: number): string {
  return join(WALLETS_DIR, `${userId}.json`);
}

export interface UserWallet {
  address: string;
  createdAt: string;
}

/** Generate a new wallet for a user using openssl secp256k1. */
function generateWallet(): { address: string; privateKey: string } {
  // Build minimal DER for secp256k1 private key
  const privateKeyBytes = randomBytes(32);
  const inner = Buffer.concat([
    Buffer.from("020101", "hex"),
    Buffer.from("0420", "hex"),
    privateKeyBytes,
    Buffer.from("a00706052b8104000a", "hex"),
  ]);
  const der = Buffer.concat([Buffer.from([0x30, inner.length]), inner]);

  // Extract uncompressed public key via openssl
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const ecResult = spawnSync("openssl", ["ec", "-inform", "DER", "-pubout", "-outform", "DER"], {
    input: der,
    encoding: "buffer",
  });
  if (ecResult.status !== 0) {
    throw new Error("openssl ec failed: " + ecResult.stderr?.toString());
  }
  const pubDer = ecResult.stdout as Buffer;
  const idx = pubDer.lastIndexOf(0x04);
  if (idx === -1 || pubDer.length - idx < 65) throw new Error("Could not parse public key");
  const pubBytes = pubDer.slice(idx + 1, idx + 65); // 64 bytes X+Y

  // Keccak256 of pub bytes -> last 20 = address
  const keccakResult = spawnSync("openssl", ["dgst", "-sha3-256", "-binary"], {
    input: pubBytes,
    encoding: "buffer",
  });
  if (keccakResult.status !== 0) throw new Error("openssl keccak failed");
  const hash = keccakResult.stdout as Buffer;
  const address = "0x" + hash.slice(-20).toString("hex");

  return { address, privateKey: "0x" + privateKeyBytes.toString("hex") };
}

/** Create a wallet for a user. Throws if one already exists. */
export async function createUserWallet(userId: number): Promise<UserWallet> {
  await mkdir(WALLETS_DIR, { recursive: true });
  const path = walletPath(userId);
  if (await Bun.file(path).exists()) {
    throw new Error("Wallet already exists for this user");
  }

  const secret = await getSecret();
  const key = deriveKey(secret, userId);
  const { address, privateKey } = generateWallet();

  const record = {
    address,
    encryptedKey: encrypt(key, privateKey),
    createdAt: new Date().toISOString(),
  };

  await Bun.write(path, JSON.stringify(record, null, 2));
  try { execSync(`chmod 600 "${path}"`); } catch {}

  return { address, createdAt: record.createdAt };
}

/** Get a user's wallet address (public info only). Returns null if no wallet. */
export async function getUserWalletAddress(userId: number): Promise<string | null> {
  const path = walletPath(userId);
  if (!await Bun.file(path).exists()) return null;
  const record = JSON.parse(await Bun.file(path).text());
  return record.address ?? null;
}

/** Get the decrypted private key for a user's wallet. Only call for the user's own operations. */
export async function getUserPrivateKey(userId: number): Promise<string | null> {
  const path = walletPath(userId);
  if (!await Bun.file(path).exists()) return null;
  const secret = await getSecret();
  const key = deriveKey(secret, userId);
  const record = JSON.parse(await Bun.file(path).text());
  return decrypt(key, record.encryptedKey);
}

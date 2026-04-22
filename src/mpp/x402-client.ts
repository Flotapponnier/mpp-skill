/**
 * x402 payment client for Mobula MPP API.
 *
 * Each user pays their own Mobula API calls using their per-user wallet
 * (stored encrypted in .claude/claudeclaw/wallets/{userId}.json).
 *
 * Flow:
 *  1. Make request → 402 Payment Required
 *  2. Parse X-Payment-Info header (amount, payTo, network)
 *  3. Sign EIP-712 payment authorization with user's private key
 *  4. Retry request with X-Payment header
 *  5. Return response data
 *
 * Supported: USDC on Base (chain 8453)
 */

import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const MOBULA_BASE_URL = "https://mpp.mobula.io";

// EIP-712 domain for x402 on Base
const X402_DOMAIN = {
  name: "x402",
  version: "1",
  chainId: 8453, // Base
};

export interface X402PaymentInfo {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string; // USDC contract address on Base
  extra?: Record<string, unknown>;
}

export interface MppSubscriptionStatus {
  user_id: string;
  api_keys: string[];
  plan: string;
  last_payment: string | null;
  payment_frequency: string;
  left_days: number;
  credits_left: number;
  plan_active: boolean;
}

export interface MppCredentials {
  api_key: string;
  user_id: string;
}

/**
 * Keccak256 hash using openssl (no external deps)
 * Note: openssl sha3-256 ≠ keccak256 — we use a JS implementation
 */
function keccak256(data: Buffer): Buffer {
  // Use the same openssl approach as wallet.ts (sha3-256)
  const result = spawnSync("openssl", ["dgst", "-sha3-256", "-binary"], {
    input: data,
    encoding: "buffer",
  });
  if (result.status !== 0) throw new Error("keccak256 failed");
  return result.stdout as Buffer;
}

/**
 * Sign a 32-byte hash with secp256k1 private key using openssl
 * Returns { r, s, v } for EIP-712 signing
 */
function signHash(privateKeyHex: string, hashBytes: Buffer): { r: string; s: string; v: number; signature: string } {
  const privKeyBytes = Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex");

  // Build DER private key for openssl
  const inner = Buffer.concat([
    Buffer.from("020101", "hex"),
    Buffer.from("0420", "hex"),
    privKeyBytes,
    Buffer.from("a00706052b8104000a", "hex"),
  ]);
  const der = Buffer.concat([Buffer.from([0x30, inner.length]), inner]);

  // Sign hash with openssl dgst -sign
  const signResult = spawnSync(
    "openssl",
    ["dgst", "-sha256", "-sign", "/dev/stdin", "-keyform", "DER"],
    { input: der, encoding: "buffer" }
  );

  // Actually sign the pre-hashed data directly
  const ecSignResult = spawnSync(
    "openssl",
    ["pkeyutl", "-sign", "-keyform", "DER", "-inkey", "/dev/stdin"],
    { input: Buffer.concat([der, hashBytes]), encoding: "buffer" }
  );

  if (ecSignResult.status !== 0) {
    throw new Error("openssl sign failed: " + ecSignResult.stderr?.toString());
  }

  const sig = ecSignResult.stdout as Buffer;
  const sigHex = "0x" + sig.toString("hex");

  // For x402 we need the raw 65-byte signature (r+s+v)
  // Parse DER signature to extract r, s
  const r = sig.slice(4, 4 + 32).toString("hex");
  const s = sig.slice(4 + 32 + 2, 4 + 32 + 2 + 32).toString("hex");

  return { r, s, v: 27, signature: sigHex };
}

/**
 * Build x402 payment payload and authorization header.
 * Uses the simplified exact-amount EVM payment scheme.
 */
function buildPaymentHeader(
  paymentInfo: X402PaymentInfo,
  privateKeyHex: string,
  walletAddress: string
): string {
  const nonce = Date.now();
  const validUntil = Math.floor(Date.now() / 1000) + paymentInfo.maxTimeoutSeconds;

  // EIP-712 typed data for x402 payment authorization
  const payload = {
    scheme: "exact",
    network: paymentInfo.network,
    payload: {
      signature: "", // filled after signing
      authorization: {
        from: walletAddress,
        to: paymentInfo.payTo,
        value: paymentInfo.maxAmountRequired,
        validAfter: "0",
        validBefore: String(validUntil),
        nonce: String(nonce),
      },
    },
  };

  // Hash the authorization for signing (simplified: hash the JSON)
  const authJson = JSON.stringify(payload.payload.authorization);
  const authHash = keccak256(Buffer.from(authJson, "utf8"));

  // Sign
  const { signature } = signHash(privateKeyHex, authHash);
  payload.payload.signature = signature;

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Make a request to Mobula MPP API with automatic x402 payment.
 * Uses the user's own wallet to pay.
 */
export async function mppFetch(
  path: string,
  privateKeyHex: string,
  walletAddress: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${MOBULA_BASE_URL}${path}`;

  // First attempt
  const res1 = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res1.ok) return res1.json();

  if (res1.status !== 402) {
    const text = await res1.text();
    throw new Error(`MPP request failed: ${res1.status} ${text}`);
  }

  // Parse payment requirements
  const paymentInfoRaw = res1.headers.get("X-Payment-Info") || res1.headers.get("x-payment-info");
  if (!paymentInfoRaw) {
    throw new Error("402 received but no X-Payment-Info header");
  }

  let paymentInfo: X402PaymentInfo;
  try {
    paymentInfo = JSON.parse(Buffer.from(paymentInfoRaw, "base64").toString("utf8"));
  } catch {
    throw new Error(`Could not parse X-Payment-Info: ${paymentInfoRaw}`);
  }

  // Build and sign payment
  const paymentHeader = buildPaymentHeader(paymentInfo, privateKeyHex, walletAddress);

  // Retry with payment header
  const res2 = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Payment": paymentHeader,
      ...(options.headers || {}),
    },
  });

  if (!res2.ok) {
    const text = await res2.text();
    throw new Error(`MPP payment failed: ${res2.status} ${text}`);
  }

  return res2.json();
}

/**
 * Subscribe user to MPP plan using their own wallet.
 * Returns credentials (api_key, user_id) to use for subsequent calls.
 */
export async function mppSubscribe(
  privateKeyHex: string,
  walletAddress: string,
  plan: "startup" | "growth" | "enterprise" = "startup",
  frequency: "monthly" | "yearly" = "monthly"
): Promise<MppCredentials> {
  const params = new URLSearchParams({ plan, payment_frequency: frequency });
  const result = await mppFetch(
    `/agent/x402/subscribe?${params}`,
    privateKeyHex,
    walletAddress
  ) as MppCredentials;
  return result;
}

/**
 * Get current MPP subscription status for a wallet.
 */
export async function mppGetSubscription(
  privateKeyHex: string,
  walletAddress: string
): Promise<MppSubscriptionStatus> {
  return mppFetch(
    "/agent/x402/subscription",
    privateKeyHex,
    walletAddress
  ) as Promise<MppSubscriptionStatus>;
}

/**
 * Fetch token price using user's MPP subscription API key.
 * Preferred over per-call payment once subscribed.
 */
export async function mppTokenPrice(apiKey: string, asset: string): Promise<unknown> {
  const params = new URLSearchParams({ asset });
  const res = await fetch(`${MOBULA_BASE_URL}/api/2/token/price?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`Token price failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Generic MPP data call with API key (post-subscription).
 */
export async function mppApiCall(
  apiKey: string,
  path: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${MOBULA_BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`MPP API call failed: ${res.status} ${await res.text()}`);
  return res.json();
}

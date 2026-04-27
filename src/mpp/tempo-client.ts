/**
 * Tempo MPP client — per-call payments using user's own wallet.
 *
 * Flow:
 *  1. Call Mobula endpoint → 402 with WWW-Authenticate: Payment header
 *  2. Parse challenge (id, request: {amount, currency, recipient})
 *  3. Sign + broadcast transferWithMemo(recipient, amount, challengeId) on Tempo
 *  4. Retry with Authorization: Payment <base64url(credential)>
 *  5. Get 200 response
 *
 * Token: USDC.e on Tempo (chainId 4217)
 * Contract: 0x20c000000000000000000000b9537d11c60e8b50
 * Function: transferWithMemo(address to, uint256 amount, bytes32 memo)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type Hex,
  encodeFunctionData,
  keccak256,
  toBytes,
  toHex,
  hexToBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Tempo mainnet
const TEMPO_CHAIN = {
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.tempo.xyz"] } },
} as const;

// USDC.e on Tempo
export const USDC_E = "0x20c000000000000000000000b9537d11c60e8b50" as const;

// Public bridge UI for moving funds onto Tempo
export const BRIDGE_URL = "https://relay.link/bridge/tempo";

const USDC_ABI = parseAbi([
  "function transferWithMemo(address to, uint256 amount, bytes32 memo) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const MOBULA_BASE_URL = "https://mpp.mobula.io";

interface MppChallenge {
  id: string;
  amount: string;
  currency: string;
  recipient: string;
  chainId: number;
  expires: string;
}

function parseWwwAuthenticate(header: string): MppChallenge | null {
  try {
    // Extract fields from: Payment id="...", realm="...", method="tempo", request="base64...", expires="..."
    const idMatch = header.match(/\bid="([^"]+)"/);
    const requestMatch = header.match(/\brequest="([^"]+)"/);
    const expiresMatch = header.match(/\bexpires="([^"]+)"/);

    if (!idMatch || !requestMatch) return null;

    const id = idMatch[1];
    const expires = expiresMatch?.[1] ?? "";

    // Decode base64url request
    const requestJson = Buffer.from(requestMatch[1], "base64").toString("utf8");
    const request = JSON.parse(requestJson);

    return {
      id,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient,
      chainId: request.methodDetails?.chainId ?? 4217,
      expires,
    };
  } catch {
    return null;
  }
}

function challengeIdToBytes32(challengeId: string): Hex {
  // Encode challengeId as bytes32 — right-pad with zeros if < 32 bytes
  const bytes = Buffer.from(challengeId, "utf8");
  const padded = Buffer.alloc(32);
  bytes.copy(padded, 0, 0, Math.min(bytes.length, 32));
  return `0x${padded.toString("hex")}`;
}

function buildCredential(challenge: MppChallenge, txHash: Hex, walletAddress: string): string {
  const credential = {
    challenge: {
      id: challenge.id,
      realm: "mpp.mobula.io",
      method: "tempo",
      intent: "charge",
    },
    payload: {
      type: "hash",
      hash: txHash,
    },
    source: `did:pkh:eip155:${challenge.chainId}:${walletAddress}`,
  };
  return Buffer.from(JSON.stringify(credential)).toString("base64url");
}

/**
 * Get USDC.e balance on Tempo for an address.
 */
export async function getTempoBalance(address: string): Promise<bigint> {
  const client = createPublicClient({
    chain: TEMPO_CHAIN,
    transport: http(),
  });
  return client.readContract({
    address: USDC_E,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as Hex],
  });
}

/**
 * Make a Mobula API call, paying per-call via MPP/Tempo with the user's wallet.
 *
 * @param path     - e.g. "/api/2/token/price"
 * @param params   - query params
 * @param privateKeyHex - user's private key (0x...)
 */
export async function tempoFetch(
  path: string,
  params: Record<string, string>,
  privateKeyHex: Hex
): Promise<unknown> {
  const url = new URL(`${MOBULA_BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  // First attempt — no auth
  const res1 = await fetch(url.toString());
  if (res1.ok) return res1.json();

  if (res1.status !== 402) {
    throw new Error(`Mobula ${path}: ${res1.status} ${await res1.text()}`);
  }

  // Parse 402 challenge
  const wwwAuth = res1.headers.get("www-authenticate");
  if (!wwwAuth) throw new Error("402 but no WWW-Authenticate header");

  const challenge = parseWwwAuthenticate(wwwAuth);
  if (!challenge) throw new Error(`Could not parse challenge from: ${wwwAuth}`);

  if (challenge.chainId !== 4217) {
    throw new Error(`Unexpected chain in challenge: ${challenge.chainId} (expected Tempo 4217)`);
  }

  // Sign and broadcast transferWithMemo
  const account = privateKeyToAccount(privateKeyHex);

  // Check balance before attempting tx
  const balance = await getTempoBalance(account.address);
  const required = BigInt(challenge.amount);
  if (balance < required) {
    const balanceUsd = (Number(balance) / 1_000_000).toFixed(4);
    const requiredUsd = (Number(required) / 1_000_000).toFixed(4);
    throw new Error(
      `Insufficient Tempo balance: you have $${balanceUsd} USDC.e, need $${requiredUsd}.\n` +
      `Fund your wallet at: https://relay.link/bridge/tempo?toAddress=${account.address}`
    );
  }

  const walletClient = createWalletClient({
    account,
    chain: TEMPO_CHAIN,
    transport: http(),
  });

  const memo = challengeIdToBytes32(challenge.id);

  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: USDC_E,
      abi: USDC_ABI,
      functionName: "transferWithMemo",
      args: [challenge.recipient as Hex, BigInt(challenge.amount), memo],
    });
  } catch (err: any) {
    throw new Error(`Tempo tx failed: ${err.message ?? err}`);
  }

  // Build credential and retry
  const credential = buildCredential(challenge, txHash, account.address);

  const res2 = await fetch(url.toString(), {
    headers: { Authorization: `Payment ${credential}` },
  });

  if (!res2.ok) {
    const body = await res2.text();
    throw new Error(`Mobula payment rejected: ${res2.status} ${body}`);
  }

  return res2.json();
}

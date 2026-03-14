// =============================================================================
// Browser FROST 2-of-2 — Client-side nonce generation and partial signing
// =============================================================================
// Port of supabase/functions/_shared/frost/frost.ts for the browser.
// Uses identical math, domain separator, and libraries.
// =============================================================================

import { sha512 } from '@noble/hashes/sha512';
import { ed25519 } from '@noble/curves/ed25519';

const L = ed25519.CURVE.n;
const G = ed25519.ExtendedPoint.BASE;
const DOMAIN_SEPARATOR = 'botwallet/frost/v1/key-share';

function mod(a: bigint, m: bigint): bigint {
  const result = a % m;
  return result >= 0n ? result : result + m;
}

function bytesToNumberLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = result * 256n + BigInt(bytes[i]);
  }
  return result;
}

function numberToBytes32LE(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let val = n;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export interface SigningNonce {
  secret: Uint8Array;
  commitment: Uint8Array;
}

export function generateNonce(): SigningNonce {
  const randomBytes = crypto.getRandomValues(new Uint8Array(64));
  const secretBigInt = mod(bytesToNumberLE(randomBytes), L);
  const secret = secretBigInt === 0n ? 1n : secretBigInt;
  const secretBytes = numberToBytes32LE(secret);
  const commitmentPoint = G.multiply(secret);
  const commitment = commitmentPoint.toRawBytes();
  return { secret: secretBytes, commitment };
}

export function scalarFromEntropy(entropy: Uint8Array): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN_SEPARATOR);
  const input = concatBytes(entropy, domainBytes);
  const digest = sha512(input);
  const scalar = mod(bytesToNumberLE(digest), L);
  return numberToBytes32LE(scalar);
}

export function derivePublicShare(scalarBytes: Uint8Array): Uint8Array {
  const s = bytesToNumberLE(scalarBytes);
  return G.multiply(s).toRawBytes();
}

export function computePartialSig(
  nonceSecret: Uint8Array,
  ourCommitment: Uint8Array,
  serverCommitment: Uint8Array,
  groupKey: Uint8Array,
  message: Uint8Array,
  keyShareSecret: Uint8Array,
): Uint8Array {
  const ourPoint = ed25519.ExtendedPoint.fromHex(ourCommitment);
  const theirPoint = ed25519.ExtendedPoint.fromHex(serverCommitment);
  const groupNoncePoint = ourPoint.add(theirPoint);
  const groupNonce = groupNoncePoint.toRawBytes();

  const challengeHash = sha512(concatBytes(groupNonce, groupKey, message));
  const k = mod(bytesToNumberLE(challengeHash), L);

  const r = bytesToNumberLE(nonceSecret);
  const s = bytesToNumberLE(keyShareSecret);
  const z = mod(r + mod(k * s, L), L);

  return numberToBytes32LE(z);
}

export function zeroMemory(arr: Uint8Array): void {
  crypto.getRandomValues(arr);
  arr.fill(0);
}

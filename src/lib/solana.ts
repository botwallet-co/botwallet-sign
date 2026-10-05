// =============================================================================
// Solana message decoding — just enough to check a USDC transfer before signing
// =============================================================================
// Mirrors how supabase/functions/_shared/solana/transaction.ts builds messages:
// a legacy (unversioned) message with the fee payer and the wallet as signers.
// =============================================================================

import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';
import { base58Decode } from './base58';

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Pinned here rather than taken from the server, so the server can't swap the token.
const USDC_MINTS: Record<string, string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // SPL Token Faucet's USDC-Dev, as used by the Botwallet backend on devnet
  devnet: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
};

export function usdcMintFor(network: string): string | null {
  return Object.prototype.hasOwnProperty.call(USDC_MINTS, network) ? USDC_MINTS[network] : null;
}

export interface CompiledInstruction {
  programIndex: number;
  accounts: number[];
  data: Uint8Array;
}

export interface LegacyMessage {
  numRequiredSignatures: number;
  numReadonlySigned: number;
  numReadonlyUnsigned: number;
  accountKeys: Uint8Array[];
  recentBlockhash: Uint8Array;
  instructions: CompiledInstruction[];
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) throw new Error('message ends early');
    return this.bytes[this.offset++];
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new Error('message ends early');
    const out = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  // Solana's short_vec length: 1–3 bytes, minimal encoding only.
  compactU16(): number {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const byte = this.u8();
      value |= (byte & 0x7f) << (7 * i);
      if ((byte & 0x80) === 0) {
        if (i > 0 && byte === 0) throw new Error('non-minimal length');
        if (value > 0xffff) throw new Error('length too large');
        return value;
      }
    }
    throw new Error('length too long');
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }
}

/** Parses a legacy Solana message. Throws on versioned messages, bad indexes or trailing bytes. */
export function parseLegacyMessage(bytes: Uint8Array): LegacyMessage {
  const r = new Reader(bytes);
  const numRequiredSignatures = r.u8();
  // Versioned (v0) messages set the top bit and can load accounts from lookup tables.
  if (numRequiredSignatures & 0x80) throw new Error('versioned message');
  const numReadonlySigned = r.u8();
  const numReadonlyUnsigned = r.u8();

  const keyCount = r.compactU16();
  const accountKeys: Uint8Array[] = [];
  for (let i = 0; i < keyCount; i++) accountKeys.push(r.take(32));
  if (numRequiredSignatures > keyCount || numReadonlySigned > numRequiredSignatures
    || numReadonlyUnsigned > keyCount - numRequiredSignatures) {
    throw new Error('header does not fit the account list');
  }

  const recentBlockhash = r.take(32);

  const instructionCount = r.compactU16();
  const instructions: CompiledInstruction[] = [];
  for (let i = 0; i < instructionCount; i++) {
    const programIndex = r.u8();
    const accountCount = r.compactU16();
    const accounts: number[] = [];
    for (let j = 0; j < accountCount; j++) accounts.push(r.u8());
    const data = r.take(r.compactU16());
    if (programIndex >= keyCount || accounts.some(a => a >= keyCount)) {
      throw new Error('account index out of range');
    }
    instructions.push({ programIndex, accounts, data });
  }

  if (!r.done()) throw new Error('unexpected bytes after the instructions');

  return {
    numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned,
    accountKeys, recentBlockhash, instructions,
  };
}

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/** The canonical (associated) token account of `owner` for `mint`. */
export function associatedTokenAddress(owner: Uint8Array, mint: Uint8Array): Uint8Array {
  const tokenProgram = base58Decode(TOKEN_PROGRAM_ID);
  const ataProgram = base58Decode(ASSOCIATED_TOKEN_PROGRAM_ID);
  for (let bump = 255; bump >= 0; bump--) {
    const input = new Uint8Array(32 * 4 + 1 + PDA_MARKER.length);
    input.set(owner, 0);
    input.set(tokenProgram, 32);
    input.set(mint, 64);
    input[96] = bump;
    input.set(ataProgram, 97);
    input.set(PDA_MARKER, 129);
    const hash = sha256(input);
    if (!isOnCurve(hash)) return hash;
  }
  throw new Error('no valid token account address');
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]);
  return value;
}

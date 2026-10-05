import { sha256 } from '@noble/hashes/sha256';
import { base58Decode } from '../src/lib/base58';
import {
  associatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID,
  type LegacyMessage, type CompiledInstruction,
} from '../src/lib/solana';

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** A fixed 32-byte public key for a label. */
export function key(label: string): Uint8Array {
  return sha256(new TextEncoder().encode(label));
}

export const USDC_MAINNET = base58Decode('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

function compactU16(value: number): number[] {
  if (value < 0x80) return [value];
  if (value < 0x4000) return [(value & 0x7f) | 0x80, value >> 7];
  return [(value & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value >> 14];
}

/** Serializes a legacy message, so tests can tamper with a parsed one and re-encode it. */
export function encodeMessage(msg: LegacyMessage): Uint8Array {
  const out: number[] = [msg.numRequiredSignatures, msg.numReadonlySigned, msg.numReadonlyUnsigned];
  out.push(...compactU16(msg.accountKeys.length));
  for (const k of msg.accountKeys) out.push(...k);
  out.push(...msg.recentBlockhash);
  out.push(...compactU16(msg.instructions.length));
  for (const ix of msg.instructions) {
    out.push(ix.programIndex, ...compactU16(ix.accounts.length), ...ix.accounts);
    out.push(...compactU16(ix.data.length), ...ix.data);
  }
  return Uint8Array.from(out);
}

export function transferData(amount: bigint): Uint8Array {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  return data;
}

export interface TokenAccountInfo {
  address: Uint8Array;
  exists: boolean;
}

export interface ServerBuild {
  feePayer: Uint8Array;
  wallet: Uint8Array;
  /** The sender's token account: the ATA, or before Oct 2026 the first one Solana listed. */
  fromTokenAccount: Uint8Array;
  toWallet: Uint8Array;
  toTokenAccount: TokenAccountInfo;
  /** Omitted when the server has no fee collection wallet configured. */
  feeCollection?: { owner: Uint8Array; account: TokenAccountInfo };
  mint?: Uint8Array;
  amount: bigint;
  fee: bigint;
  blockhash?: Uint8Array;
}

/**
 * Port of the message assembly in supabase/functions/_shared/solana/transaction.ts
 * (buildTransferTransaction): same account order, header and instructions.
 */
export function buildServerMessage(o: ServerBuild): Uint8Array {
  const mint = o.mint ?? USDC_MAINNET;
  const hasPlatformFee = o.fee > 0n && !!o.feeCollection;
  const needsRecipientAta = !o.toTokenAccount.exists;
  const needsFeeCollectionAta = hasPlatformFee && !o.feeCollection!.account.exists;

  const accountKeys: Uint8Array[] = [];
  const addAccount = (k: Uint8Array): number => {
    const found = accountKeys.findIndex(a => a.every((b, i) => b === k[i]));
    if (found >= 0) return found;
    accountKeys.push(k);
    return accountKeys.length - 1;
  };

  const feePayerIdx = addAccount(o.feePayer);
  const senderWalletIdx = addAccount(o.wallet);
  const fromTokenIdx = addAccount(o.fromTokenAccount);
  const toTokenIdx = addAccount(o.toTokenAccount.address);
  const feeCollectionAtaIdx = hasPlatformFee ? addAccount(o.feeCollection!.account.address) : -1;

  let recipientWalletIdx = -1;
  let feeCollectionWalletIdx = -1;
  let usdcMintIdx = -1;
  let systemProgramIdx = -1;
  let ataProgramIdx = -1;
  if (needsRecipientAta || needsFeeCollectionAta) {
    if (needsRecipientAta) recipientWalletIdx = addAccount(o.toWallet);
    if (needsFeeCollectionAta) feeCollectionWalletIdx = addAccount(o.feeCollection!.owner);
    usdcMintIdx = addAccount(mint);
    systemProgramIdx = addAccount(base58Decode(SYSTEM_PROGRAM_ID));
    ataProgramIdx = addAccount(base58Decode(ASSOCIATED_TOKEN_PROGRAM_ID));
  }
  const tokenProgramIdx = addAccount(base58Decode(TOKEN_PROGRAM_ID));

  const writableUnsigned = new Set([fromTokenIdx, toTokenIdx]);
  if (feeCollectionAtaIdx >= 0) writableUnsigned.add(feeCollectionAtaIdx);
  writableUnsigned.delete(feePayerIdx);
  writableUnsigned.delete(senderWalletIdx);

  const instructions: CompiledInstruction[] = [];
  if (needsRecipientAta) {
    instructions.push({
      programIndex: ataProgramIdx,
      accounts: [feePayerIdx, toTokenIdx, recipientWalletIdx, usdcMintIdx, systemProgramIdx, tokenProgramIdx],
      data: new Uint8Array([1]),
    });
  }
  if (needsFeeCollectionAta) {
    instructions.push({
      programIndex: ataProgramIdx,
      accounts: [feePayerIdx, feeCollectionAtaIdx, feeCollectionWalletIdx, usdcMintIdx, systemProgramIdx, tokenProgramIdx],
      data: new Uint8Array([1]),
    });
  }
  instructions.push({
    programIndex: tokenProgramIdx,
    accounts: [fromTokenIdx, toTokenIdx, senderWalletIdx],
    data: transferData(o.amount),
  });
  if (hasPlatformFee) {
    instructions.push({
      programIndex: tokenProgramIdx,
      accounts: [fromTokenIdx, feeCollectionAtaIdx, senderWalletIdx],
      data: transferData(o.fee),
    });
  }

  return encodeMessage({
    numRequiredSignatures: 2,
    numReadonlySigned: 0,
    numReadonlyUnsigned: accountKeys.length - 2 - writableUnsigned.size,
    accountKeys,
    recentBlockhash: o.blockhash ?? key('blockhash'),
    instructions,
  });
}

/** Token account info for `owner`'s canonical USDC account. */
export function ata(owner: Uint8Array, exists: boolean, mint = USDC_MAINNET): TokenAccountInfo {
  return { address: associatedTokenAddress(owner, mint), exists };
}

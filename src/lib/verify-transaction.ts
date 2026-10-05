// =============================================================================
// Check the transaction before Key 1 signs it
// =============================================================================
// The server builds the Solana transaction. Before this browser adds the Key 1
// signature, decode it and make sure it does exactly what the owner reviewed.
// Anything else is refused, so a compromised server can't use Key 1 to move
// more money, or send it somewhere else, than the owner approved.
//
// checkTransferMessage applies the rules of the Agent CLI's txcheck package
// (packages/cli-go/solana/txcheck), which the MCP server applies too, and all
// three run the same test vectors (tests/txcheck-vectors.json):
//   1. Legacy message, every length in its shortest form, no account listed
//      twice, no bytes after the instructions.
//   2. Exactly two signers: Botwallet's fee payer first, then the wallet,
//      which may be a read-only signer. The group key is the wallet address.
//   3. Only these instructions:
//      - Associated Token Account Create or CreateIdempotent of a USDC
//        account, paid by the fee payer, for an owner other than the wallet,
//        and paid into by one of the transfers. At most two.
//      - Token program Transfer authorized by the wallet, with neither the
//        source nor the destination being the wallet's own address.
//      No compute budget, no TransferChecked, no other program: the server
//      builds none of them.
//   4. One or two transfers. The first is the payment: the reviewed amount,
//      into the recipient's associated USDC account. The second, if any, is
//      the fee: from the same token account as the payment, for at most the
//      reviewed fee. The Token program refuses a transfer between accounts of
//      different tokens, so the payment's USDC destination makes its source a
//      USDC account, and the fee shares that source.
// =============================================================================

import type { SigningIntentDetails } from './api';
import { decodeAddress } from './base58';
import {
  parseLegacyMessage, associatedTokenAddress, bytesEqual, readU64LE, usdcMintFor,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, type LegacyMessage,
} from './solana';

/** The transaction or the details don't match what the owner approved. `message` says why, for debugging. */
export class TransactionMismatchError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TransactionMismatchError';
  }
}

function mismatch(reason: string): never {
  throw new TransactionMismatchError(reason);
}

/** What the dashboard asked for, carried in the signing link. Older links don't have it. */
export interface ExpectedTransfer {
  amountCents?: number;
  toAddress?: string;
}

/** What checkTransferMessage holds a message to. Amounts are in USDC base units. */
export interface TransferExpectation {
  /** Network name; picks the pinned USDC mint. */
  network: string;
  /** The recipient's wallet address: the payment goes into its associated USDC account. */
  recipient: string;
  /** The payment's amount range. minAmount is above zero. */
  minAmount: bigint;
  maxAmount: bigint;
  /** The largest fee transfer. */
  maxFee: bigint;
}

/** "12.34" → 1234n. The server sends amounts with two decimals. */
export function usdcToCents(text: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

// USDC has 6 decimals, so one cent is 10,000 base units.
const BASE_UNITS_PER_CENT = 10_000n;

/** Checks the details from Botwallet against what the owner entered in the dashboard. */
export function verifyIntentMatchesRequest(details: SigningIntentDetails, expected?: ExpectedTransfer): void {
  if (!expected) return;
  if (expected.toAddress !== undefined && expected.toAddress !== details.to_address) {
    mismatch('recipient differs from the one entered in the dashboard');
  }
  if (expected.amountCents !== undefined && usdcToCents(details.amount) !== BigInt(expected.amountCents)) {
    mismatch('amount differs from the one entered in the dashboard');
  }
}

/**
 * Throws TransactionMismatchError unless `message` is the reviewed transfer
 * and `groupKey` is the wallet's address.
 */
export function verifyTransaction(details: SigningIntentDetails, groupKey: Uint8Array, message: Uint8Array): void {
  const wallet = decodeAddress(details.from_address) ?? mismatch('wallet address is not a Solana address');
  if (!bytesEqual(groupKey, wallet)) mismatch('group key is not the wallet address');

  const amountCents = usdcToCents(details.amount) ?? mismatch('amount is not a USDC amount');
  const feeCents = usdcToCents(details.fee_usdc) ?? mismatch('fee is not a USDC amount');
  const amount = amountCents * BASE_UNITS_PER_CENT;
  checkTransferMessage(message, wallet, {
    network: details.network,
    recipient: details.to_address,
    minAmount: amount,
    maxAmount: amount,
    maxFee: feeCents * BASE_UNITS_PER_CENT,
  });
}

interface Transfer {
  source: Uint8Array;
  destination: Uint8Array;
  amount: bigint;
}

/**
 * Throws TransactionMismatchError unless `message` is a payment `exp`
 * describes, from `wallet`, by the rules at the top of this file.
 */
export function checkTransferMessage(message: Uint8Array, wallet: Uint8Array, exp: TransferExpectation): void {
  const mintAddress = usdcMintFor(exp.network) ?? mismatch(`unknown network "${exp.network}"`);
  const mint = decodeAddress(mintAddress)!;
  const recipient = decodeAddress(exp.recipient) ?? mismatch('recipient address is not a Solana address');
  if (exp.maxAmount <= 0n) mismatch('amount is zero');
  if (exp.minAmount <= 0n || exp.minAmount > exp.maxAmount || exp.maxFee < 0n) mismatch('reviewed amounts are not valid');

  let msg: LegacyMessage;
  try {
    msg = parseLegacyMessage(message);
  } catch (e) {
    mismatch(`unreadable transaction: ${(e as Error).message}`);
  }

  const keys = msg.accountKeys;
  // Botwallet's fee payer signs first; the wallet is the only other signer. The wallet may be
  // a read-only signer (as other Solana libraries build it); the fee payer can't be.
  if (msg.numRequiredSignatures !== 2 || msg.numReadonlySigned > 1) mismatch('expected two signers');
  if (new Set(keys.map(k => k.join(','))).size !== keys.length) mismatch('an account is listed twice');
  if (!bytesEqual(keys[1], wallet)) mismatch('the wallet is not the second signer');

  const tokenProgram = decodeAddress(TOKEN_PROGRAM_ID)!;
  const ataProgram = decodeAddress(ASSOCIATED_TOKEN_PROGRAM_ID)!;
  const systemProgram = decodeAddress(SYSTEM_PROGRAM_ID)!;

  const transfers: Transfer[] = [];
  const created: Uint8Array[] = [];

  for (const ix of msg.instructions) {
    const program = keys[ix.programIndex];
    const accounts = ix.accounts.map(i => keys[i]);

    if (bytesEqual(program, ataProgram)) {
      // Create (empty or 0) or CreateIdempotent (1) of a USDC account, paid by the fee payer:
      // [payer, account, owner, mint, system program, token program].
      if (ix.data.length > 1 || (ix.data.length === 1 && ix.data[0] > 1)) mismatch('account instruction other than create');
      if (accounts.length !== 6) mismatch('account setup with unexpected accounts');
      if (ix.accounts[0] !== 0) mismatch('account setup not paid by the fee payer');
      const [, account, owner, accountMint, system, token] = accounts;
      if (!bytesEqual(accountMint, mint)) mismatch('account setup for another token');
      if (!bytesEqual(system, systemProgram) || !bytesEqual(token, tokenProgram)) mismatch('account setup with unexpected programs');
      if (bytesEqual(owner, wallet)) mismatch('account setup for the wallet');
      if (!bytesEqual(account, associatedTokenAddress(owner, mint))) mismatch('account setup for an unexpected address');
      created.push(account);
      if (created.length > 2) mismatch('more than two accounts set up');
    } else if (bytesEqual(program, tokenProgram)) {
      // Only a plain Transfer (3): [source, destination, authority] + u64 amount.
      if (ix.data.length !== 9 || ix.data[0] !== 3 || accounts.length !== 3) mismatch('token instruction other than a transfer');
      const [source, destination, authority] = accounts;
      if (!bytesEqual(authority, wallet)) mismatch('transfer not authorized by the wallet');
      if (bytesEqual(source, wallet) || bytesEqual(destination, wallet)) mismatch('wallet used as a token account');
      transfers.push({ source, destination, amount: readU64LE(ix.data, 1) });
    } else {
      mismatch('instruction for an unexpected program');
    }
  }

  if (transfers.length === 0) mismatch('no transfer');
  if (transfers.length > 2) mismatch('unexpected extra transfer');

  // The first transfer is the payment: the reviewed amount, into the recipient's own USDC account.
  const [payment, fee] = transfers;
  if (!bytesEqual(payment.destination, associatedTokenAddress(recipient, mint))) {
    mismatch("the payment does not go to the recipient's USDC account");
  }
  if (payment.amount < exp.minAmount || payment.amount > exp.maxAmount) mismatch('amount differs from the reviewed amount');

  // The only other movement allowed is the reviewed fee, from the same account.
  if (fee) {
    if (!bytesEqual(fee.source, payment.source)) mismatch('fee paid from a different account');
    if (fee.amount > exp.maxFee) mismatch('fee is higher than the reviewed fee');
  }

  if (created.some(c => !transfers.some(t => bytesEqual(t.destination, c)))) mismatch('unexpected account setup');
}

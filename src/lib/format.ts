import { base58Decode } from './base58';
import { usdcToCents } from './verify-transaction';
import type { SigningIntentDetails } from './api';

/** 1234n → "12.34" */
export function centsToUsdc(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** The money rows of the review, with the same names as the dashboard's review step. */
export interface FeeSummary {
  amount: string;
  /** Botwallet's fee, without the account setup fee. */
  botwalletFee: string;
  /** The one-time fee for setting up the recipient's USDC account, or null when there is none. */
  setupFee: string | null;
  /** Everything that leaves this wallet. Null if the server's amounts can't be read. */
  total: string | null;
}

/**
 * Splits the fee into its parts, in cents so the rows add up to the total exactly.
 * fee_usdc is the whole fee the transaction pays, setup fee included; it's what the
 * transaction is checked against before signing.
 */
export function summarizeFees(
  details: Pick<SigningIntentDetails, 'amount' | 'fee_usdc' | 'fee_breakdown'>,
): FeeSummary {
  const amount = usdcToCents(details.amount);
  const fee = usdcToCents(details.fee_usdc);
  if (amount === null || fee === null) {
    // Signing refuses amounts like these anyway (verify-transaction.ts).
    return { amount: details.amount, botwalletFee: details.fee_usdc, setupFee: null, total: null };
  }
  const setupText = details.fee_breakdown?.account_setup_fee_usdc;
  let setup = setupText ? usdcToCents(setupText) ?? 0n : 0n;
  if (setup > fee) setup = 0n;
  return {
    amount: centsToUsdc(amount),
    botwalletFee: centsToUsdc(fee - setup),
    setupFee: setup > 0n ? centsToUsdc(setup) : null,
    total: centsToUsdc(amount + fee),
  };
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** "9WzDXkYb..." → "9WzD XkYb ...", so the whole address is easy to compare. */
export function groupAddress(address: string): string {
  return (address.match(/.{1,4}/g) || []).join(' ');
}

export function getExplorerUrl(signature: string, network: string): string {
  const isMainnet = network === 'mainnet-beta' || network === 'mainnet';
  return isMainnet
    ? `https://solscan.io/tx/${signature}`
    : `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

/**
 * The explorer link for a transaction, built here rather than taken from the server, so the
 * receipt always points at a real explorer. Null unless `signature` is a 64-byte base58
 * Solana signature.
 */
export function transactionExplorerUrl(signature: string, network: string): string | null {
  try {
    if (base58Decode(signature).length !== 64) return null;
  } catch {
    return null;
  }
  return getExplorerUrl(signature, network);
}

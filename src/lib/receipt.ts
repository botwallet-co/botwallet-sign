import type { FrostCompleteResult, SigningIntentDetails } from './api';

/** What the success screen shows. */
export interface Receipt {
  /** The transaction's Solana signature, or null when the server didn't send one. */
  signature: string | null;
  amountUsdc: string;
  feeUsdc: string;
  /** Only known when signing_frost_complete itself saw the transaction confirmed. */
  newBalanceUsdc?: string;
}

/** The receipt for a transaction signing_frost_complete reported as confirmed. */
export function toReceipt(result: FrostCompleteResult): Receipt {
  const signature = result.solana_signature;
  return {
    signature: typeof signature === 'string' && signature ? signature : null,
    amountUsdc: result.amount_usdc,
    feeUsdc: result.fee_usdc,
    newBalanceUsdc: result.new_balance_usdc,
  };
}

/**
 * The receipt for a transaction Solana confirmed while the page was waiting for it: the
 * amounts are the reviewed ones, and there is no new balance to show.
 */
export function confirmedReceipt(
  details: Pick<SigningIntentDetails, 'amount' | 'fee_usdc'>,
  signature: string | null,
): Receipt {
  return { signature, amountUsdc: details.amount, feeUsdc: details.fee_usdc };
}

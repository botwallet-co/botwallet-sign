import { ApiError } from './api';

/**
 * signing_frost_complete answers SUBMISSION_UNCONFIRMED when it sent the transaction to
 * Solana but the network hadn't confirmed it before the reply was due. The money may still
 * move, so the page doesn't report a failure: it says the transfer was sent and asks
 * get_signing_intent until the server knows how it ended.
 */
export interface SentUnconfirmed {
  /** The transaction's Solana signature, when the server sent it. */
  signature: string | null;
}

/** The SUBMISSION_UNCONFIRMED answer, or null for any other error. */
export function sentUnconfirmed(error: unknown): SentUnconfirmed | null {
  if (!(error instanceof ApiError) || error.code !== 'SUBMISSION_UNCONFIRMED') return null;
  const signature = error.details.solana_signature;
  return { signature: typeof signature === 'string' && signature ? signature : null };
}

/**
 * What a get_signing_intent check says about a transfer that was sent and was waiting for
 * Solana:
 *   completed   it went through
 *   failed      it didn't go through, and no money moved
 *   confirming  still waiting for Solana, or the check got no clear answer: check again
 *   unknown     the link can't tell anymore; the owner checks the dashboard
 *
 * Once the transfer was sent, the server answers INTENT_COMPLETED with the link's status:
 * 'completed' or 'failed' when it knows the outcome, 'signing' (or 'expired', when the
 * link's 15 minutes ran out meanwhile) while Solana hasn't confirmed it yet.
 */
export type Confirmation = 'completed' | 'failed' | 'confirming' | 'unknown';

/** `error` is what get_signing_intent threw; undefined when it returned the details. */
export function confirmationOf(error: unknown): Confirmation {
  // The details came back, so the server couldn't look the transfer up just now.
  if (error === undefined) return 'confirming';
  if (!(error instanceof ApiError)) return 'confirming';

  switch (error.code) {
    case 'INTENT_COMPLETED': {
      const status = typeof error.details.intent_status === 'string'
        ? error.details.intent_status
        : /already (completed|failed)\b/i.exec(error.message)?.[1]?.toLowerCase();
      if (status === 'completed') return 'completed';
      if (status === 'failed') return 'failed';
      if (/still being confirmed/i.test(error.message) || status === 'signing') return 'confirming';
      return 'unknown';
    }
    case 'INTENT_EXPIRED':
    case 'INVALID_TOKEN':
      return 'unknown';
    default:
      // No answer, or a passing problem on Botwallet's side
      return 'confirming';
  }
}

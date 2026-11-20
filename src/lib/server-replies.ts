// =============================================================================
// What the page reads from Botwallet's error replies besides the code
// =============================================================================
// A few replies share an error code and differ only in their wording, and the
// difference decides whether the owner may sign again with the same link or is
// told the money may have moved. The phrases below come from the server's
// signing-link code (supabase/functions/public/signing/token.ts and
// attempt.ts, and public/handlers/signing-frost.ts); rewording one there
// changes what this page says. tests/server-replies.test.ts, errors.test.ts and
// confirming.test.ts hold copies of the server's messages.
// =============================================================================

import { ApiError } from './api';
import type { ActionKind } from './action';

function replyText(error: unknown): string {
  return error instanceof ApiError ? error.message : '';
}

/** The status a reply words as "This signing session is already <status>", if it names one. */
export function statusInWording(error: unknown): string | undefined {
  return /already (completed|failed|expired)\b/i.exec(replyText(error))?.[1]?.toLowerCase();
}

/**
 * The link's status in an INTENT_COMPLETED reply: its intent_status, or for replies without
 * one, the status in its wording.
 */
export function intentStatusOf(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const status = error.details.intent_status;
  if (typeof status === 'string') return status;
  return statusInWording(error);
}

/** "This <kind> was sent to Solana and is still being confirmed": sent, and the outcome isn't known yet. */
export function isStillConfirming(error: unknown): boolean {
  return /still being confirmed/i.test(replyText(error));
}

/** The kind of transaction a reply names, if it names one. */
export function namedKind(error: unknown): ActionKind | null {
  const named = /\b(transfer|withdrawal)\b/i.exec(replyText(error))?.[1]?.toLowerCase();
  return named === 'transfer' || named === 'withdrawal' ? named : null;
}

/** "This withdrawal is already being signed": an earlier attempt's signing round is still open. */
export function isRoundInProgress(error: unknown): boolean {
  return /already being signed/i.test(replyText(error));
}

/**
 * "Signing took longer than the 60 second limit, so nothing was sent": the round lapsed
 * before anything was submitted, and the server put the link back for another try.
 */
export function isRoundTimedOut(error: unknown): boolean {
  const text = replyText(error);
  return /60 second limit/i.test(text) && /nothing was sent/i.test(text);
}

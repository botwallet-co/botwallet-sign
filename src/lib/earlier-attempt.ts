import type { SigningIntentDetails } from './api';

/**
 * What to show when the details load, given any earlier signing attempt with this link:
 *   none           the review, as usual
 *   may-have-sent  a warning instead of the review: the money may already be on its way
 *   wait           the review, with Continue held until `until`: an attempt started moments
 *                  ago and nothing was sent, and the server frees the link after that
 */
export type EarlierAttempt =
  | { kind: 'none' }
  | { kind: 'may-have-sent' }
  | { kind: 'wait'; until: number };

// A signing round lasts 60 seconds. A retry time further out than this comes from a
// clock that disagrees with this device's, so wait one round instead.
const ROUND = 60_000;
const MAX_WAIT = 2 * ROUND;

/**
 * `submittedHere` says this tab sent a signed transaction for this link and was reloaded
 * before the reply came. Servers that don't send signing_state leave only that to go on.
 */
export function earlierAttempt(
  details: Pick<SigningIntentDetails, 'signing_state' | 'retry_after'>,
  submittedHere: boolean,
  now: number = Date.now(),
): EarlierAttempt {
  const state = details.signing_state;
  // The server knows the earlier round sent nothing.
  if (state === 'stale') return { kind: 'none' };
  if (state === 'submitting' || submittedHere) return { kind: 'may-have-sent' };
  if (state === 'in_progress') {
    const at = details.retry_after ? Date.parse(details.retry_after) : NaN;
    const wait = at - now;
    return { kind: 'wait', until: wait > 0 && wait <= MAX_WAIT ? at : now + ROUND };
  }
  return { kind: 'none' };
}

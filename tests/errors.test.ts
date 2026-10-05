// What the owner is told after a failure must match what really happened to the money.
// Every error code that supabase/functions/public/handlers/human-signing.ts returns is
// listed here per phase, with the server's message where errors.ts depends on its wording.

import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/lib/api';
import { describeFailure, type Failure, type SignPhase } from '../src/lib/errors';
import { TransactionMismatchError } from '../src/lib/verify-transaction';

// Server wording, copied from human-signing.ts.
const SERVER = {
  serviceUnavailable: "We couldn't check this link right now. Try again in a moment.",
  invalidToken: 'Invalid or expired signing session',
  expired: 'Signing session has expired. Return to dashboard to start again.',
  completed: 'This signing session is already completed',
  failed: 'This signing session is already failed',
  expiredStatus: 'This signing session is already expired',
  pending: 'This signing session is already pending',
  beingSigned: 'This withdrawal is already being signed. Wait a minute, then try again.',
  inProgress: 'This signing session is already in progress or completed',
  keyNeeded: 'Key 1 is needed to sign for this wallet.',
  keyWrong: "Those words aren't Key 1 for this wallet. Nothing was sent. Check the words and try again.",
  timedOut: 'Signing took longer than the 60 second limit, so nothing was sent. Try again.',
  attemptNotFound: "We couldn't find this signing attempt. Check the wallet in your dashboard before trying again.",
  attemptUsed: 'This signing attempt was already used. Check the wallet in your dashboard before trying again.',
  stillConfirming: 'This withdrawal was sent to Solana and is still being confirmed. Check your wallet in the dashboard.',
  unconfirmed: "Your withdrawal was sent to Solana but isn't confirmed yet. It may still go through, so don't send it again. Check your wallet in the dashboard in a minute.",
};

type Outcome = 'retry-load' | 'retry-sign' | 'not-sent' | 'went-through' | 'unknown';

function outcome(f: Failure): string {
  if (f.retry === 'load') return 'retry-load';
  if (f.retry === 'sign') return 'retry-sign';
  if (/nothing was sent/i.test(f.message)) return 'not-sent';
  if (/may have gone through|already been used/i.test(f.message)) return 'unknown';
  if (/went through/i.test(f.message)) return 'went-through';
  return `unclassified: ${f.message}`;
}

const CASES: [SignPhase, string, string, Outcome][] = [
  // get_signing_intent
  ['load', 'NETWORK_ERROR', '', 'retry-load'],
  ['load', 'PARSE_ERROR', '', 'retry-load'],
  ['load', 'SERVICE_UNAVAILABLE', SERVER.serviceUnavailable, 'retry-load'],
  ['load', 'VALIDATION_ERROR', 'intent_id and signing_token are required', 'retry-load'],
  ['load', 'WALLET_NOT_FOUND', 'Wallet not found', 'retry-load'],
  ['load', 'INVALID_TOKEN', SERVER.invalidToken, 'not-sent'],
  ['load', 'INTENT_EXPIRED', SERVER.expired, 'not-sent'],
  ['load', 'INTENT_COMPLETED', SERVER.completed, 'went-through'],
  ['load', 'INTENT_COMPLETED', SERVER.failed, 'not-sent'],
  ['load', 'INTENT_COMPLETED', SERVER.expiredStatus, 'not-sent'],
  ['load', 'INTENT_COMPLETED', SERVER.stillConfirming, 'retry-load'],

  // signing_frost_init: nothing is submitted yet
  ['init', 'NETWORK_ERROR', '', 'retry-sign'],
  ['init', 'PARSE_ERROR', '', 'retry-sign'],
  ['init', 'UNKNOWN', '', 'retry-sign'],
  ['init', 'SERVICE_UNAVAILABLE', SERVER.serviceUnavailable, 'retry-sign'],
  ['init', 'KEY_MISMATCH', SERVER.keyNeeded, 'retry-sign'],
  ['init', 'KEY_MISMATCH', SERVER.keyWrong, 'retry-sign'],
  ['init', 'INTENT_COMPLETED', SERVER.beingSigned, 'retry-sign'],
  ['init', 'INTENT_COMPLETED', SERVER.inProgress, 'unknown'],
  ['init', 'INTENT_COMPLETED', SERVER.completed, 'went-through'],
  ['init', 'INTENT_COMPLETED', SERVER.failed, 'not-sent'],
  ['init', 'INTENT_COMPLETED', SERVER.stillConfirming, 'retry-load'],
  ['init', 'INVALID_TOKEN', SERVER.invalidToken, 'not-sent'],
  ['init', 'INTENT_EXPIRED', SERVER.expired, 'not-sent'],
  ['init', 'WALLET_NOT_FOUND', 'Wallet not found', 'not-sent'],
  ['init', 'VALIDATION_ERROR', 'nonce_commitment must be 32 bytes, got 31', 'not-sent'],
  ['init', 'BALANCE_CHECK_FAILED', 'Could not verify balance. Try again later.', 'not-sent'],
  ['init', 'INSUFFICIENT_FUNDS', 'Insufficient USDC. Available: $1.00', 'not-sent'],
  ['init', 'RECIPIENT_ATA_ERROR', 'Could not determine recipient token account', 'not-sent'],
  ['init', 'RECIPIENT_ATA_CLOSED', 'Recipient token account was closed after this signing request was created.', 'not-sent'],
  ['init', 'TRANSACTION_BUILD_FAILED', 'Failed to prepare transaction. Please try again later.', 'not-sent'],
  ['init', 'INTERNAL_ERROR', 'Failed to create signing session', 'not-sent'],

  // signing_frost_complete: anything not known to happen before submission is "may have gone through"
  ['complete', 'VALIDATION_ERROR', 'Invalid base64 in partial_sig', 'not-sent'],
  ['complete', 'NOT_FOUND', 'Transaction not found', 'not-sent'],
  ['complete', 'MISSING_PUBLIC_SHARE', 'Wallet is missing agent_public_share', 'not-sent'],
  ['complete', 'WALLET_NOT_FOUND', 'Wallet not found', 'not-sent'],
  ['complete', 'INVALID_PARTIAL_SIG', 'Signature verification failed.', 'not-sent'],
  ['complete', 'TRANSACTION_FAILED', 'Transaction simulation failed', 'not-sent'],
  ['complete', 'INVALID_TOKEN', SERVER.invalidToken, 'not-sent'],
  ['complete', 'INTENT_EXPIRED', SERVER.expired, 'not-sent'],
  ['complete', 'SESSION_EXPIRED', SERVER.timedOut, 'retry-sign'],
  ['complete', 'SESSION_EXPIRED', SERVER.attemptNotFound, 'unknown'],
  ['complete', 'SESSION_EXPIRED', SERVER.attemptUsed, 'unknown'],
  ['complete', 'INTENT_COMPLETED', SERVER.completed, 'went-through'],
  ['complete', 'INTENT_COMPLETED', SERVER.pending, 'unknown'],
  // Sent and not confirmed yet: SigningFlow waits for the result (confirming.ts)
  ['complete', 'SUBMISSION_UNCONFIRMED', SERVER.unconfirmed, 'retry-load'],
  ['complete', 'INTERNAL_ERROR', 'Internal server error', 'unknown'],
  ['complete', 'SERVICE_UNAVAILABLE', SERVER.serviceUnavailable, 'unknown'],
  ['complete', 'NETWORK_ERROR', '', 'unknown'],
  ['complete', 'PARSE_ERROR', '', 'unknown'],
  ['complete', 'UNKNOWN', '', 'unknown'],
];

describe('describeFailure', () => {
  it.each(CASES)('%s %s "%s" → %s', (phase, code, message, expected) => {
    const failure = describeFailure(new ApiError(code, message), phase, 'withdrawal');
    expect(outcome(failure)).toBe(expected);

    // Retries keep the link; everything else drops it.
    expect(failure.endSession).toBe(!failure.retry);
    if (expected === 'unknown') {
      expect(failure.tone).toBe('warning');
      expect(failure.next).toMatch(/check your wallet/i);
    }
    // Being offline isn't something support needs a code for.
    if (code === 'NETWORK_ERROR') expect(failure.code).toBeUndefined();
  });

  it('errors in this browser before or during signing never claim money moved', () => {
    expect(outcome(describeFailure(new Error('bad words'), 'prepare', 'withdrawal'))).toBe('retry-sign');
    expect(outcome(describeFailure(new Error('bad point'), 'sign', 'withdrawal'))).toBe('not-sent');
  });

  it('a transaction that does not match the review is refused, with a code for support', () => {
    const atSign = describeFailure(new TransactionMismatchError('amount differs'), 'sign', 'withdrawal');
    expect(outcome(atSign)).toBe('not-sent');
    expect(atSign.code).toBe('TX_MISMATCH');
    expect(atSign.endSession).toBe(true);
    expect(atSign.retry).toBeUndefined();

    const atLoad = describeFailure(new TransactionMismatchError('recipient differs'), 'load', 'transfer');
    expect(outcome(atLoad)).toBe('not-sent');
    expect(atLoad.code).toBe('DETAILS_MISMATCH');
    expect(atLoad.message).toMatch(/transfer/);
  });

  it('names the action', () => {
    expect(describeFailure(new ApiError('INSUFFICIENT_FUNDS', ''), 'init', 'transfer').title).toBe('Transfer Not Sent');
    expect(describeFailure(new ApiError('INSUFFICIENT_FUNDS', ''), 'init', 'withdrawal').title).toBe('Withdrawal Not Sent');
    expect(describeFailure(new ApiError('UNKNOWN', ''), 'complete', 'transfer').message).toMatch(/transfer may have gone through/);
  });
});

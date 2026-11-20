// The wording the page reads from Botwallet's error replies. Server texts are copied from
// supabase/functions/public/signing/token.ts and public/handlers/signing-frost.ts.

import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/lib/api';
import {
  intentStatusOf, isRoundInProgress, isRoundTimedOut, isStillConfirming, namedKind, statusInWording,
} from '../src/lib/server-replies';

const STILL_CONFIRMING = 'This transfer was sent to Solana and is still being confirmed. Check your wallet in the dashboard.';
const BEING_SIGNED = 'This withdrawal is already being signed. Wait a minute, then try again.';
const TIMED_OUT = 'Signing took longer than the 60 second limit, so nothing was sent. Try again.';

describe('intentStatusOf', () => {
  it("prefers the reply's intent_status", () => {
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already completed', { intent_status: 'completed' })))
      .toBe('completed');
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', BEING_SIGNED, { intent_status: 'signing' }))).toBe('signing');
  });

  it('reads "already <status>" from replies without one', () => {
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already completed'))).toBe('completed');
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already FAILED'))).toBe('failed');
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already expired'))).toBe('expired');
  });

  it('has no status otherwise', () => {
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already in progress or completed'))).toBeUndefined();
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'This signing session is already pending'))).toBeUndefined();
    expect(intentStatusOf(new ApiError('INTENT_COMPLETED', 'x', { intent_status: 42 }))).toBeUndefined();
    expect(intentStatusOf(new Error('This signing session is already completed'))).toBeUndefined();
  });
});

describe('statusInWording', () => {
  it('reads only the wording, whatever intent_status says', () => {
    expect(statusInWording(new ApiError('INTENT_COMPLETED', 'This signing session is already completed', { intent_status: 'failed' })))
      .toBe('completed');
    expect(statusInWording(new ApiError('INTENT_COMPLETED', 'This signing session is already in progress or completed', { intent_status: 'failed' })))
      .toBeUndefined();
    expect(statusInWording(new ApiError('INTENT_COMPLETED', 'This signing session is already Expired'))).toBe('expired');
    expect(statusInWording(new Error('This signing session is already completed'))).toBeUndefined();
  });
});

describe('reply wording', () => {
  it('tells a sent transfer that is still confirming, and names its kind', () => {
    const error = new ApiError('INTENT_COMPLETED', STILL_CONFIRMING, { intent_status: 'signing' });
    expect(isStillConfirming(error)).toBe(true);
    expect(namedKind(error)).toBe('transfer');
    expect(namedKind(new ApiError('INTENT_COMPLETED', BEING_SIGNED))).toBe('withdrawal');
    expect(namedKind(new ApiError('INTENT_COMPLETED', 'This signing session is already completed'))).toBeNull();
  });

  it('tells a signing round that is still open', () => {
    expect(isRoundInProgress(new ApiError('INTENT_COMPLETED', BEING_SIGNED, { intent_status: 'signing' }))).toBe(true);
    expect(isRoundInProgress(new ApiError('INTENT_COMPLETED', STILL_CONFIRMING))).toBe(false);
  });

  it('tells a round that ran out of time before anything was sent', () => {
    expect(isRoundTimedOut(new ApiError('SESSION_EXPIRED', TIMED_OUT))).toBe(true);
    expect(isRoundTimedOut(new ApiError('SESSION_EXPIRED', 'This signing attempt was already used. Check the wallet in your dashboard before trying again.')))
      .toBe(false);
    // Both halves are needed: running out of time alone says nothing about the money
    expect(isRoundTimedOut(new ApiError('SESSION_EXPIRED', 'Signing took longer than the 60 second limit.'))).toBe(false);
  });

  it('reads nothing from errors that are not replies', () => {
    for (const error of [new Error(STILL_CONFIRMING), undefined, STILL_CONFIRMING]) {
      expect(isStillConfirming(error)).toBe(false);
      expect(isRoundInProgress(error)).toBe(false);
      expect(namedKind(error)).toBeNull();
    }
  });
});

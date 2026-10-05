// A transfer that was sent to Solana but not confirmed when Botwallet replied may still go
// through: the page must say it was sent, never offer to sign it again, and report how it
// ended once the server knows. Server wording is copied from human-signing.ts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiError, getSigningIntent, signingFrostComplete } from '../src/lib/api';
import { confirmationOf, sentUnconfirmed } from '../src/lib/confirming';
import { afterConfirming, describeFailure } from '../src/lib/errors';

const SIGNATURE = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
const UNCONFIRMED = "Your withdrawal was sent to Solana but isn't confirmed yet. It may still go through, so don't send it again. Check your wallet in the dashboard in a minute.";
const STILL_CONFIRMING = 'This transfer was sent to Solana and is still being confirmed. Check your wallet in the dashboard.';

function stubReply(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sentUnconfirmed', () => {
  it('keeps the signature of the transaction that was sent', async () => {
    stubReply(202, {
      success: false,
      error: {
        code: 'SUBMISSION_UNCONFIRMED',
        message: UNCONFIRMED,
        solana_signature: SIGNATURE,
        explorer_url: `https://solscan.io/tx/${SIGNATURE}`,
        transaction_id: 'tx-1',
      },
    });
    const error = await signingFrostComplete('intent-1', 'token', 'session-1', 'AAAA').catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(sentUnconfirmed(error)).toEqual({ signature: SIGNATURE });
  });

  it('copes without a signature', () => {
    expect(sentUnconfirmed(new ApiError('SUBMISSION_UNCONFIRMED', UNCONFIRMED, { transaction_id: 'tx-1' })))
      .toEqual({ signature: null });
  });

  it('is null for every other answer', () => {
    expect(sentUnconfirmed(new ApiError('TRANSACTION_FAILED', 'Transaction simulation failed'))).toBeNull();
    expect(sentUnconfirmed(new ApiError('NETWORK_ERROR', ''))).toBeNull();
    expect(sentUnconfirmed(new Error('boom'))).toBeNull();
  });
});

describe('confirmationOf', () => {
  it("reads the link's status from get_signing_intent's answer", async () => {
    stubReply(409, {
      success: false,
      error: { code: 'INTENT_COMPLETED', message: 'This signing session is already completed', intent_status: 'completed' },
    });
    const error = await getSigningIntent('intent-1', 'token').catch(e => e);
    expect(confirmationOf(error)).toBe('completed');
  });

  it.each([
    ['completed', 'This signing session is already completed', 'completed'],
    ['failed', 'This signing session is already failed', 'failed'],
    ['signing', STILL_CONFIRMING, 'confirming'],
    // The link's 15 minutes ran out while Solana was confirming
    ['expired', STILL_CONFIRMING, 'confirming'],
    ['expired', 'This signing session is already expired', 'unknown'],
  ])('INTENT_COMPLETED with the link %s: "%s" → %s', (intentStatus, message, expected) => {
    expect(confirmationOf(new ApiError('INTENT_COMPLETED', message, { intent_status: intentStatus }))).toBe(expected);
  });

  it('reads the status from the message when the server sends no intent_status', () => {
    expect(confirmationOf(new ApiError('INTENT_COMPLETED', 'This signing session is already completed'))).toBe('completed');
    expect(confirmationOf(new ApiError('INTENT_COMPLETED', 'This signing session is already failed'))).toBe('failed');
    expect(confirmationOf(new ApiError('INTENT_COMPLETED', STILL_CONFIRMING))).toBe('confirming');
  });

  it('keeps checking after an answer that says nothing about the outcome', () => {
    expect(confirmationOf(undefined)).toBe('confirming');
    for (const code of ['NETWORK_ERROR', 'PARSE_ERROR', 'SERVICE_UNAVAILABLE', 'UNKNOWN']) {
      expect(confirmationOf(new ApiError(code, '')), code).toBe('confirming');
    }
  });

  it('stops when the link no longer tells', () => {
    expect(confirmationOf(new ApiError('INTENT_EXPIRED', 'Signing session has expired. Return to dashboard to start again.')))
      .toBe('unknown');
    expect(confirmationOf(new ApiError('INVALID_TOKEN', 'Invalid or expired signing session'))).toBe('unknown');
  });
});

describe('after confirming', () => {
  it('a transfer Solana dropped was not sent', () => {
    const f = afterConfirming('failed', 'transfer');
    expect(f.title).toBe('Transfer Not Sent');
    expect(f.message).toMatch(/nothing was sent/);
    expect(f.endSession).toBe(true);
  });

  it('an outcome the link no longer tells may have gone through', () => {
    const f = afterConfirming('unknown', 'withdrawal');
    expect(f.message).toMatch(/withdrawal may have gone through/);
    expect(f.next).toMatch(/Check your wallet/);
    expect(f.code).toBeUndefined();
  });
});

describe('a link whose transfer is still confirming', () => {
  it('says it was sent, never offers to sign again, and checks again by reloading', () => {
    for (const phase of ['load', 'init'] as const) {
      const f = describeFailure(new ApiError('INTENT_COMPLETED', STILL_CONFIRMING, { intent_status: 'signing' }), phase, 'withdrawal');
      expect(f.title).toBe('Confirming on Solana');
      // The server names the kind: this page's guess can be wrong before the details load
      expect(f.message).toMatch(/Your transfer was sent to Solana/);
      expect(f.message).not.toMatch(/nothing was sent/i);
      expect(f.next).toMatch(/Don't send it again/);
      expect(f.retry).toBe('load');
      expect(f.retryLabel).toBe('Check Again');
      expect(f.endSession).toBe(false);
    }
  });
});

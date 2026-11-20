// After a reload, or when another tab already started signing, the page must not offer a
// fresh review for a withdrawal that may already be on its way.

import { describe, it, expect } from 'vitest';
import { earlierAttempt } from '../src/lib/earlier-attempt';
import { mayHaveGoneThrough } from '../src/lib/errors';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

describe('earlierAttempt', () => {
  it('shows the review when no attempt is under way', () => {
    expect(earlierAttempt({}, false, NOW)).toEqual({ kind: 'none' });
  });

  it('warns after this tab sent the transaction, even when the server says nothing', () => {
    expect(earlierAttempt({}, true, NOW)).toEqual({ kind: 'may-have-sent' });
  });

  it('warns when the server says the transaction was handed over for sending', () => {
    expect(earlierAttempt({ signing_state: 'submitting' }, false, NOW)).toEqual({ kind: 'may-have-sent' });
  });

  it("trusts the server's word that an earlier round sent nothing", () => {
    expect(earlierAttempt({ signing_state: 'stale' }, true, NOW)).toEqual({ kind: 'none' });
  });

  it('keeps warning when this tab sent the transaction and the server reports a round in progress', () => {
    expect(earlierAttempt({ signing_state: 'in_progress', retry_after: at(30) }, true, NOW))
      .toEqual({ kind: 'may-have-sent' });
  });

  it('holds Continue until the server frees the link', () => {
    expect(earlierAttempt({ signing_state: 'in_progress', retry_after: at(42) }, false, NOW))
      .toEqual({ kind: 'wait', until: NOW + 42_000 });
  });

  it('waits one signing round when the retry time is missing or out of range', () => {
    for (const retry_after of [undefined, 'soon', at(-5), at(600)]) {
      expect(earlierAttempt({ signing_state: 'in_progress', retry_after }, false, NOW), String(retry_after))
        .toEqual({ kind: 'wait', until: NOW + 60_000 });
    }
  });
});

describe('mayHaveGoneThrough', () => {
  it('says the money may have moved and checks again instead of signing again', () => {
    const f = mayHaveGoneThrough('withdrawal');
    expect(f.message).toMatch(/withdrawal may have gone through/);
    expect(f.next).toMatch(/Check your wallet/);
    expect(f.message).not.toMatch(/nothing was sent/i);
    expect(f.retry).toBe('load');
    expect(f.retryLabel).toBe('Check Again');
    expect(f.endSession).toBe(false);
  });
});

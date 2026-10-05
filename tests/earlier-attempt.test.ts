// After a reload, or when another tab already started signing, the page must not offer a
// fresh review for a withdrawal that may already be on its way.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { earlierAttempt } from '../src/lib/earlier-attempt';
import { mayHaveGoneThrough } from '../src/lib/errors';
import {
  markSubmitting, clearSubmitting, wasSubmitting, clearStoredSession,
} from '../src/lib/fragment';

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

describe('submit marker', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is kept per link until the reply arrives or the session ends', () => {
    expect(wasSubmitting('intent-1')).toBe(false);
    markSubmitting('intent-1');
    expect(wasSubmitting('intent-1')).toBe(true);
    expect(wasSubmitting('intent-2')).toBe(false);

    clearSubmitting();
    expect(wasSubmitting('intent-1')).toBe(false);

    markSubmitting('intent-1');
    clearStoredSession();
    expect(wasSubmitting('intent-1')).toBe(false);
  });

  it('does nothing when storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => markSubmitting('intent-1')).not.toThrow();
    expect(wasSubmitting('intent-1')).toBe(false);
    expect(() => clearSubmitting()).not.toThrow();
  });
});

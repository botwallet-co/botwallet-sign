// This tab's signing session: the link survives a reload, a new link replaces it, and the
// submit marker makes a reload during submission warn that the money may have moved
// (earlier-attempt.ts) instead of offering a fresh review.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadSigningRequest, markSubmitting, clearSubmitting, wasSubmitting, clearStoredSession,
} from '../src/lib/tab-session';
import { DEFAULT_RETURN_URL } from '../src/lib/signing-request';

const STORAGE_KEY = 'botwallet-signing-session';
const SUBMIT_KEY = 'botwallet-signing-submitted';

const LINK_A = { intentId: 'intent-a', token: 'token-a', returnUrl: 'https://app.botwallet.co/bots/a' };
const LINK_B = { intentId: 'intent-b', token: 'token-b', returnUrl: 'https://app.botwallet.co/bots/b' };

let store: Map<string, string>;
let replaceState: ReturnType<typeof vi.fn>;

function fragmentOf(link: unknown): string {
  return `#${btoa(JSON.stringify(link))}`;
}

// The page at /?ref=mail, with `hash` in the address bar
function openPage(hash: string) {
  replaceState = vi.fn();
  vi.stubGlobal('window', { location: { hash, pathname: '/', search: '?ref=mail' } });
  vi.stubGlobal('history', { replaceState });
}

function blockStorage() {
  vi.stubGlobal('sessionStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  });
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSigningRequest', () => {
  it('reads the link, removes it from the address bar and keeps it for a reload', () => {
    openPage(fragmentOf(LINK_A));
    const request = loadSigningRequest();
    expect(request).toEqual({ ...LINK_A, expected: undefined });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?ref=mail');

    // Reloaded: the address bar has no link any more
    openPage('');
    expect(loadSigningRequest()).toEqual(request);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('takes a new link over the one this tab kept', () => {
    store.set(STORAGE_KEY, JSON.stringify(LINK_A));
    openPage(fragmentOf(LINK_B));
    expect(loadSigningRequest()?.intentId).toBe('intent-b');
    expect(JSON.parse(store.get(STORAGE_KEY)!).intentId).toBe('intent-b');
  });

  it('drops the kept session and the submit marker for a link it cannot read', () => {
    store.set(STORAGE_KEY, JSON.stringify(LINK_A));
    store.set(SUBMIT_KEY, 'intent-a');
    openPage('#not-a-link');
    expect(loadSigningRequest()).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?ref=mail');
    expect(store.size).toBe(0);
  });

  it('has nothing without a link or a kept session', () => {
    openPage('');
    expect(loadSigningRequest()).toBeNull();

    store.set(STORAGE_KEY, '{not json');
    expect(loadSigningRequest()).toBeNull();

    store.set(STORAGE_KEY, JSON.stringify({ intentId: 'intent-a' }));
    expect(loadSigningRequest()).toBeNull();
  });

  it('checks a kept session again when it restores it', () => {
    store.set(STORAGE_KEY, JSON.stringify({ ...LINK_A, returnUrl: 'https://evil.example/' }));
    openPage('');
    expect(loadSigningRequest()?.returnUrl).toBe(DEFAULT_RETURN_URL);
  });

  it('still reads the link when storage is unavailable', () => {
    blockStorage();
    openPage(fragmentOf(LINK_A));
    expect(loadSigningRequest()?.intentId).toBe('intent-a');

    openPage('');
    expect(loadSigningRequest()).toBeNull();
  });
});

describe('submit marker', () => {
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
    blockStorage();
    expect(() => markSubmitting('intent-1')).not.toThrow();
    expect(wasSubmitting('intent-1')).toBe(false);
    expect(() => clearSubmitting()).not.toThrow();
    expect(() => clearStoredSession()).not.toThrow();
  });
});

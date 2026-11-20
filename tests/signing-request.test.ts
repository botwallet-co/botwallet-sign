// The signing link as the dashboard writes it (apps/dashboard/src/lib/signer-url.ts,
// buildSigningLink: base64 JSON after the #). The amount and recipient in `expected` gate
// signing (verify-transaction.ts), so a field that isn't valid is dropped, never guessed.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DEFAULT_RETURN_URL, parseFragment, toSigningRequest, withSignedFlag,
} from '../src/lib/signing-request';
import type { SigningLinkPayload } from '../src/lib/signing-link';

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const DASHBOARD_REQUEST: SigningLinkPayload = {
  intentId: 'intent-1',
  token: 'token-1',
  returnUrl: 'https://app.botwallet.co/bots/abc?tab=activity',
  expected: { amountCents: 1234, toAddress: ADDRESS },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function returnUrlOf(returnUrl: unknown): string | undefined {
  return toSigningRequest({ intentId: 'intent', token: 'token', returnUrl })?.returnUrl;
}

function expectedOf(expected: unknown) {
  return toSigningRequest({ intentId: 'intent', token: 'token', expected })?.expected;
}

describe('return URL allowlist', () => {
  it('keeps dashboard return URLs', () => {
    vi.stubEnv('DEV', false);
    expect(returnUrlOf('https://app.botwallet.co/bots/abc?tab=activity'))
      .toBe('https://app.botwallet.co/bots/abc?tab=activity');
  });

  it('sends other origins, and links without one, to the dashboard', () => {
    vi.stubEnv('DEV', false);
    for (const url of [
      'https://app.botwallet.co.evil.example/',
      'http://app.botwallet.co/',
      'https://evil.example/?https://app.botwallet.co',
      'javascript:alert(1)',
      'not a url',
      '',
      undefined,
      42,
    ]) {
      expect(returnUrlOf(url), String(url)).toBe(DEFAULT_RETURN_URL);
    }
  });

  it('accepts a local dashboard only in a dev build', () => {
    vi.stubEnv('DEV', false);
    expect(returnUrlOf('http://localhost:5173/')).toBe(DEFAULT_RETURN_URL);
    expect(returnUrlOf('http://localhost:5174/')).toBe(DEFAULT_RETURN_URL);

    vi.stubEnv('DEV', true);
    expect(returnUrlOf('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(returnUrlOf('http://localhost:5174/')).toBe('http://localhost:5174/');
    expect(returnUrlOf('http://localhost:8080/')).toBe(DEFAULT_RETURN_URL);
  });
});

describe('toSigningRequest', () => {
  it('reads a link from the dashboard as it is', () => {
    expect(toSigningRequest(DASHBOARD_REQUEST)).toEqual(DASHBOARD_REQUEST);
  });

  it('needs an intent id and a token', () => {
    for (const json of [
      null, 'text', 42, {}, { intentId: 'intent' }, { token: 'token' },
      { intentId: '', token: 'token' }, { intentId: 'intent', token: '' }, { intentId: 1, token: 'token' },
    ]) {
      expect(toSigningRequest(json), JSON.stringify(json)).toBeNull();
    }
  });

  it('keeps an amount only when it is a whole, positive number of cents', () => {
    for (const amountCents of [12.5, 0, -100, '1234', null, 2 ** 53]) {
      expect(expectedOf({ amountCents, toAddress: ADDRESS }), String(amountCents)).toEqual({ toAddress: ADDRESS });
    }
    expect(expectedOf({ toAddress: ADDRESS })).toEqual({ toAddress: ADDRESS });
  });

  it('keeps a recipient only when it is a non-empty string', () => {
    for (const toAddress of ['', 42, null]) {
      expect(expectedOf({ amountCents: 1234, toAddress }), String(toAddress)).toEqual({ amountCents: 1234 });
    }
  });

  it('has no expectation when neither field is usable, or there is none', () => {
    expect(expectedOf({ amountCents: -1, toAddress: '' })).toBeUndefined();
    expect(expectedOf({})).toBeUndefined();
    expect(expectedOf('1234')).toBeUndefined();
    expect(expectedOf(undefined)).toBeUndefined();
  });
});

describe('parseFragment', () => {
  it('reads what buildSigningLink writes', () => {
    expect(parseFragment(btoa(JSON.stringify(DASHBOARD_REQUEST)))).toEqual(DASHBOARD_REQUEST);
  });

  it('reads a fragment whose base64 was URI-encoded on the way', () => {
    const plain = btoa(JSON.stringify({ intentId: 'a', token: 'b' }));
    const encoded = encodeURIComponent(plain);
    expect(encoded).not.toBe(plain); // the padding is escaped
    expect(parseFragment(encoded)).toEqual({ intentId: 'a', token: 'b', returnUrl: DEFAULT_RETURN_URL, expected: undefined });
  });

  it('is null for anything else', () => {
    for (const hash of [
      '',
      'not base64!',
      btoa('not json'),
      btoa('42'),
      btoa(JSON.stringify({ intentId: 'a' })),
      '%E0%A4%A', // a broken URI escape
    ]) {
      expect(parseFragment(hash), hash).toBeNull();
    }
  });
});

describe('withSignedFlag', () => {
  it('adds signed=1', () => {
    expect(withSignedFlag('https://app.botwallet.co')).toBe('https://app.botwallet.co/?signed=1');
  });

  it('keeps the rest of the query string and the hash', () => {
    expect(withSignedFlag('https://app.botwallet.co/bots/abc?tab=activity#history'))
      .toBe('https://app.botwallet.co/bots/abc?tab=activity&signed=1#history');
    expect(withSignedFlag('https://app.botwallet.co/?signedAt=1')).toBe('https://app.botwallet.co/?signedAt=1&signed=1');
  });

  it('replaces a signed parameter that is there already', () => {
    expect(withSignedFlag('https://app.botwallet.co/?signed=0&tab=x')).toBe('https://app.botwallet.co/?tab=x&signed=1');
    expect(withSignedFlag('https://app.botwallet.co/?signed=1')).toBe('https://app.botwallet.co/?signed=1');
  });

  it('leaves text that is not a URL alone', () => {
    expect(withSignedFlag('not a url')).toBe('not a url');
  });
});

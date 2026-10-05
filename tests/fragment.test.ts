import { describe, it, expect, afterEach, vi } from 'vitest';
import { toSigningRequest } from '../src/lib/fragment';

function returnUrlOf(returnUrl: string): string | undefined {
  return toSigningRequest({ intentId: 'intent', token: 'token', returnUrl })?.returnUrl;
}

describe('return URL allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps dashboard return URLs', () => {
    vi.stubEnv('DEV', false);
    expect(returnUrlOf('https://app.botwallet.co/bots/abc?tab=activity'))
      .toBe('https://app.botwallet.co/bots/abc?tab=activity');
  });

  it('drops other origins', () => {
    vi.stubEnv('DEV', false);
    for (const url of [
      'https://app.botwallet.co.evil.example/',
      'http://app.botwallet.co/',
      'https://evil.example/?https://app.botwallet.co',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(returnUrlOf(url), url).toBeUndefined();
    }
  });

  it('accepts a local dashboard only in a dev build', () => {
    vi.stubEnv('DEV', false);
    expect(returnUrlOf('http://localhost:5173/')).toBeUndefined();
    expect(returnUrlOf('http://localhost:5174/')).toBeUndefined();

    vi.stubEnv('DEV', true);
    expect(returnUrlOf('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(returnUrlOf('http://localhost:5174/')).toBe('http://localhost:5174/');
    expect(returnUrlOf('http://localhost:8080/')).toBeUndefined();
  });
});

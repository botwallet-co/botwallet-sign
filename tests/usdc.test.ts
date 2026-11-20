// Amounts are read and added up in cents, never as floating point: what Key 1 signs is
// checked against them (verify-transaction.ts), and the review and receipt show them.

import { describe, it, expect } from 'vitest';
import { usdcToCents, centsToUsdc } from '../src/lib/usdc';

describe('usdcToCents', () => {
  it.each([
    ['12.34', 1234n], ['0.10', 10n], ['5', 500n], ['1.5', 150n], ['1000000.00', 100000000n],
  ])('%s', (text, cents) => {
    expect(usdcToCents(text)).toBe(cents);
  });

  it.each(['1.234', '-1.00', '', '1e3', ' 1.00', '1.'])('rejects "%s"', text => {
    expect(usdcToCents(text)).toBeNull();
  });
});

describe('centsToUsdc', () => {
  it('formats cents', () => {
    expect(centsToUsdc(0n)).toBe('0.00');
    expect(centsToUsdc(5n)).toBe('0.05');
    expect(centsToUsdc(1234n)).toBe('12.34');
  });

  it('round-trips the two-decimal amounts the server sends', () => {
    for (const text of ['0.00', '0.01', '12.34', '12345678.91']) {
      expect(centsToUsdc(usdcToCents(text)!)).toBe(text);
    }
  });
});

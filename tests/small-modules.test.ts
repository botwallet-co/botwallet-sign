// The small helpers SigningFlow and the screens lean on: what the action is called, which
// expiry time this device's clock can be trusted with, and what the receipt shows.

import { describe, it, expect } from 'vitest';
import { kindOf, kindTitle } from '../src/lib/action';
import { MINUTE, trustedDeadline } from '../src/lib/deadline';
import { confirmedReceipt, toReceipt } from '../src/lib/receipt';

describe('kindOf', () => {
  it("names the server's action_type the way the page does", () => {
    expect(kindOf('transfer')).toBe('transfer');
    expect(kindOf('withdraw')).toBe('withdrawal');
    // Before the details load, or for anything unexpected
    expect(kindOf(undefined)).toBe('withdrawal');
    expect(kindOf('swap')).toBe('withdrawal');
    expect(kindTitle('transfer')).toBe('Transfer');
    expect(kindTitle('withdrawal')).toBe('Withdrawal');
  });
});

describe('trustedDeadline', () => {
  const NOW = Date.parse('2026-10-04T12:00:00Z');
  const at = (ms: number) => new Date(NOW + ms).toISOString();

  it("counts down to the server's expiry when it is within a link's 15 minutes", () => {
    expect(trustedDeadline(at(15 * MINUTE), NOW)).toBe(NOW + 15 * MINUTE);
    expect(trustedDeadline(at(30_000), NOW)).toBe(NOW + 30_000);
    // A minute of slack for a clock that runs a little behind
    expect(trustedDeadline(at(16 * MINUTE), NOW)).toBe(NOW + 16 * MINUTE);
  });

  it("doesn't count down when this device's clock disagrees with the server", () => {
    expect(trustedDeadline(at(16 * MINUTE + 1), NOW)).toBeNull();
    expect(trustedDeadline(at(0), NOW)).toBeNull();
    expect(trustedDeadline(at(-MINUTE), NOW)).toBeNull();
  });

  it('has no deadline without a readable expiry', () => {
    expect(trustedDeadline(undefined, NOW)).toBeNull();
    expect(trustedDeadline('', NOW)).toBeNull();
    expect(trustedDeadline('soon', NOW)).toBeNull();
  });
});

describe('receipts', () => {
  it('show what signing_frost_complete reported', () => {
    expect(toReceipt({ solana_signature: 'sig', amount_usdc: '12.34', fee_usdc: '1.25', new_balance_usdc: '86.41' }))
      .toEqual({ signature: 'sig', amountUsdc: '12.34', feeUsdc: '1.25', newBalanceUsdc: '86.41' });
  });

  it('have no signature when the server sent none', () => {
    expect(toReceipt({ solana_signature: '', amount_usdc: '12.34', fee_usdc: '1.25', new_balance_usdc: '86.41' }).signature)
      .toBeNull();
  });

  it('show the reviewed amounts, and no balance, after waiting for Solana', () => {
    expect(confirmedReceipt({ amount: '12.34', fee_usdc: '1.25' }, 'sig'))
      .toEqual({ signature: 'sig', amountUsdc: '12.34', feeUsdc: '1.25' });
    expect(confirmedReceipt({ amount: '12.34', fee_usdc: '1.25' }, null).signature).toBeNull();
  });
});

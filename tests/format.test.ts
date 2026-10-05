import { describe, it, expect } from 'vitest';
import { base58Encode } from '../src/lib/base58';
import { transactionExplorerUrl, summarizeFees, centsToUsdc } from '../src/lib/format';

function signatureOf(bytes: number[]): string {
  return base58Encode(Uint8Array.from(bytes));
}

const SIGNATURE = signatureOf(Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256));

describe('transactionExplorerUrl', () => {
  it('links mainnet transactions to Solscan and the rest to the devnet explorer', () => {
    expect(transactionExplorerUrl(SIGNATURE, 'mainnet-beta')).toBe(`https://solscan.io/tx/${SIGNATURE}`);
    expect(transactionExplorerUrl(SIGNATURE, 'devnet'))
      .toBe(`https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`);
  });

  it('accepts short encodings of valid signatures', () => {
    // A signature that starts with zero bytes encodes to fewer than 86 characters.
    const short = signatureOf([0, 0, 0, ...Array.from({ length: 61 }, (_, i) => i + 1)]);
    expect(short.length).toBeLessThan(86);
    expect(transactionExplorerUrl(short, 'mainnet-beta')).toBe(`https://solscan.io/tx/${short}`);
  });

  it('gives no link for anything that is not a 64-byte signature', () => {
    const bad = [
      '',
      signatureOf(Array(63).fill(7)),
      signatureOf(Array(65).fill(7)),
      `1${SIGNATURE}`,
      `${SIGNATURE.slice(0, -1)}0`,
      `${SIGNATURE.slice(0, 40)}/../../evil.example`,
      `https://evil.example/tx/${SIGNATURE}`,
    ];
    for (const signature of bad) {
      expect(transactionExplorerUrl(signature, 'mainnet-beta'), signature).toBeNull();
    }
  });
});

describe('summarizeFees', () => {
  it('splits the fee into the Botwallet fee and the account setup fee', () => {
    expect(summarizeFees({
      amount: '100.00',
      fee_usdc: '2.50',
      fee_breakdown: { platform_fee_usdc: '0.50', account_setup_fee_usdc: '2.00' },
    })).toEqual({ amount: '100.00', botwalletFee: '0.50', setupFee: '2.00', total: '102.50' });
  });

  it('leaves out the setup row when there is no setup fee', () => {
    expect(summarizeFees({
      amount: '0.10',
      fee_usdc: '0.05',
      fee_breakdown: { platform_fee_usdc: '0.05', account_setup_fee_usdc: '0.00' },
    })).toEqual({ amount: '0.10', botwalletFee: '0.05', setupFee: null, total: '0.15' });
    expect(summarizeFees({ amount: '7.00', fee_usdc: '0.10' }))
      .toEqual({ amount: '7.00', botwalletFee: '0.10', setupFee: null, total: '7.10' });
  });

  it('keeps the rows adding up when the server repeats the whole fee as the platform fee', () => {
    // With no platform fee recorded, the server sends the whole fee as platform_fee_usdc.
    const fees = summarizeFees({
      amount: '5.00',
      fee_usdc: '2.00',
      fee_breakdown: { platform_fee_usdc: '2.00', account_setup_fee_usdc: '2.00' },
    });
    expect(fees).toEqual({ amount: '5.00', botwalletFee: '0.00', setupFee: '2.00', total: '7.00' });
  });

  it('adds up in cents, not floating point', () => {
    expect(summarizeFees({ amount: '0.10', fee_usdc: '0.20' }).total).toBe('0.30');
    expect(summarizeFees({ amount: '12345678.91', fee_usdc: '0.09' }).total).toBe('12345679.00');
  });

  it('gives no total when the amounts are not USDC amounts', () => {
    expect(summarizeFees({ amount: 'abc', fee_usdc: '1.00' }).total).toBeNull();
    expect(summarizeFees({ amount: '1.00', fee_usdc: '-1.00' }).total).toBeNull();
  });

  it('formats cents', () => {
    expect(centsToUsdc(0n)).toBe('0.00');
    expect(centsToUsdc(5n)).toBe('0.05');
    expect(centsToUsdc(1234n)).toBe('12.34');
  });
});

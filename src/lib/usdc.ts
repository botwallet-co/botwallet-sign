// USDC amounts as the server writes them ("12.34") and as the page adds them up (cents).

/** "12.34" → 1234n. The server sends amounts with two decimals. */
export function usdcToCents(text: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/** 1234n → "12.34" */
export function centsToUsdc(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

// USDC has 6 decimals, so one cent is 10,000 base units.
export const BASE_UNITS_PER_CENT = 10_000n;

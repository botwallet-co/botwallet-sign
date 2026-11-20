export const MINUTE = 60_000;

/**
 * When the link expires by this device's clock, or null to show only the general limit.
 * Signing links last 15 minutes: if this device's clock disagrees with the server's expiry,
 * a countdown would be wrong.
 */
export function trustedDeadline(expiresAt: string | undefined, now: number = Date.now()): number | null {
  const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
  const left = deadline - now;
  return left > 0 && left <= 16 * MINUTE ? deadline : null;
}

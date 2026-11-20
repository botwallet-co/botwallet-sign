// The signing link: what the dashboard puts after the # (its shape is signing-link.ts),
// read and checked here. Keeping it in this tab is tab-session.ts.

import type { ExpectedTransfer } from './verify-transaction';
import type { SigningLinkPayload } from './signing-link';

export interface SigningRequest {
  intentId: string;
  token: string;
  /** Where "Return to Dashboard" goes: the link's return URL if its origin is allowed, else the dashboard. */
  returnUrl: string;
  /** The amount and recipient entered in the dashboard, checked against the server's details. */
  expected?: ExpectedTransfer;
}

export const DEFAULT_RETURN_URL = 'https://app.botwallet.co';

const SAFE_RETURN_ORIGINS = ['https://app.botwallet.co'];

// A dashboard running locally can send people back to itself only from a dev build of this
// page (npm run dev). Production builds leave these out.
const DEV_RETURN_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

function sanitizeReturnUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const allowed = import.meta.env.DEV ? [...SAFE_RETURN_ORIGINS, ...DEV_RETURN_ORIGINS] : SAFE_RETURN_ORIGINS;
  try {
    const parsed = new URL(url);
    if (allowed.includes(parsed.origin)) {
      return url;
    }
  } catch { /* invalid URL */ }
  return undefined;
}

// Links from older dashboards don't carry `expected`; then only the review screen is checked.
function toExpected(json: unknown): ExpectedTransfer | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const { amountCents, toAddress } = json as Partial<Record<keyof SigningLinkPayload['expected'], unknown>>;
  const expected: ExpectedTransfer = {};
  if (typeof amountCents === 'number' && Number.isSafeInteger(amountCents) && amountCents > 0) {
    expected.amountCents = amountCents;
  }
  if (typeof toAddress === 'string' && toAddress) expected.toAddress = toAddress;
  return expected.amountCents !== undefined || expected.toAddress !== undefined ? expected : undefined;
}

export function toSigningRequest(json: unknown): SigningRequest | null {
  if (!json || typeof json !== 'object') return null;
  const { intentId, token, returnUrl, expected } = json as Partial<Record<keyof SigningLinkPayload, unknown>>;
  if (typeof intentId !== 'string' || !intentId || typeof token !== 'string' || !token) return null;
  return {
    intentId,
    token,
    returnUrl: sanitizeReturnUrl(returnUrl) ?? DEFAULT_RETURN_URL,
    expected: toExpected(expected),
  };
}

/** The request in a link's # part (without the #): base64 JSON, possibly URI-encoded. Null if it isn't one. */
export function parseFragment(hash: string): SigningRequest | null {
  try {
    return toSigningRequest(JSON.parse(atob(decodeURIComponent(hash))));
  } catch {
    return null;
  }
}

/**
 * Adds signed=1 to the return URL so the dashboard can confirm the result.
 * The rest of the query string and the hash are kept as they are.
 */
export function withSignedFlag(url: string): string {
  try {
    const parsed = new URL(url);
    const params = parsed.search.slice(1).split('&').filter(p => p && p.split('=')[0] !== 'signed');
    parsed.search = [...params, 'signed=1'].join('&');
    return parsed.toString();
  } catch {
    return url;
  }
}

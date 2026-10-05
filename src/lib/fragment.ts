import type { ExpectedTransfer } from './verify-transaction';

export interface SigningRequest {
  intentId: string;
  token: string;
  returnUrl?: string;
  /** The amount and recipient entered in the dashboard, checked against the server's details. */
  expected?: ExpectedTransfer;
}

export const DEFAULT_RETURN_URL = 'https://app.botwallet.co';

const SAFE_RETURN_ORIGINS = ['https://app.botwallet.co'];

// A dashboard running locally can send people back to itself only from a dev build of this
// page (npm run dev). Production builds leave these out.
const DEV_RETURN_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

// sessionStorage is per tab and is cleared when the tab closes.
const STORAGE_KEY = 'botwallet-signing-session';
const SUBMIT_KEY = 'botwallet-signing-submitted';

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
  const { amountCents, toAddress } = json as Record<string, unknown>;
  const expected: ExpectedTransfer = {};
  if (typeof amountCents === 'number' && Number.isSafeInteger(amountCents) && amountCents > 0) {
    expected.amountCents = amountCents;
  }
  if (typeof toAddress === 'string' && toAddress) expected.toAddress = toAddress;
  return expected.amountCents !== undefined || expected.toAddress !== undefined ? expected : undefined;
}

export function toSigningRequest(json: unknown): SigningRequest | null {
  if (!json || typeof json !== 'object') return null;
  const { intentId, token, returnUrl, expected } = json as Record<string, unknown>;
  if (typeof intentId !== 'string' || !intentId || typeof token !== 'string' || !token) return null;
  return { intentId, token, returnUrl: sanitizeReturnUrl(returnUrl), expected: toExpected(expected) };
}

function parseFragment(hash: string): SigningRequest | null {
  try {
    return toSigningRequest(JSON.parse(atob(decodeURIComponent(hash))));
  } catch {
    return null;
  }
}

function saveSession(request: SigningRequest): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request));
  } catch { /* storage unavailable */ }
}

function restoreSession(): SigningRequest | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? toSigningRequest(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SUBMIT_KEY);
  } catch { /* storage unavailable */ }
}

/**
 * Kept while the signed transaction is on its way to Botwallet, so that after a reload the
 * page warns the owner it may have gone through instead of showing a fresh review.
 */
export function markSubmitting(intentId: string): void {
  try {
    sessionStorage.setItem(SUBMIT_KEY, intentId);
  } catch { /* storage unavailable */ }
}

export function clearSubmitting(): void {
  try {
    sessionStorage.removeItem(SUBMIT_KEY);
  } catch { /* storage unavailable */ }
}

export function wasSubmitting(intentId: string): boolean {
  try {
    return sessionStorage.getItem(SUBMIT_KEY) === intentId;
  } catch {
    return false;
  }
}

/**
 * Reads the signing session from the URL fragment, or from this tab's
 * sessionStorage when the page is reloaded without one. The fragment is
 * removed from the address bar as soon as it is read.
 */
export function loadSigningRequest(): SigningRequest | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return restoreSession();

  clearFragment();

  const request = parseFragment(hash);
  if (request) saveSession(request);
  else clearStoredSession();
  return request;
}

export function clearFragment(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
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

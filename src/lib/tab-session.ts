// This tab's signing session: the link, kept so a reload doesn't lose it, and the marker
// that makes a reload during submission warn that the money may have moved
// (earlier-attempt.ts). sessionStorage is per tab and is cleared when the tab closes.

import { parseFragment, toSigningRequest, type SigningRequest } from './signing-request';

const STORAGE_KEY = 'botwallet-signing-session';
const SUBMIT_KEY = 'botwallet-signing-submitted';

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

function clearFragment(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
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

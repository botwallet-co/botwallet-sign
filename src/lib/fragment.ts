export interface SigningRequest {
  intentId: string;
  token: string;
  returnUrl?: string;
}

const SAFE_RETURN_ORIGINS = [
  'https://app.botwallet.co',
  'http://localhost:5173',
  'http://localhost:5174',
];

function sanitizeReturnUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (SAFE_RETURN_ORIGINS.some(o => parsed.origin === new URL(o).origin)) {
      return url;
    }
  } catch { /* invalid URL */ }
  return undefined;
}

export function parseFragment(): SigningRequest | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  clearFragment();

  try {
    const json = JSON.parse(atob(hash));
    if (!json.intentId || !json.token) return null;
    return {
      intentId: json.intentId,
      token: json.token,
      returnUrl: sanitizeReturnUrl(json.returnUrl),
    };
  } catch {
    return null;
  }
}

export function clearFragment(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

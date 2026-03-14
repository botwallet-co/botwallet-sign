export interface SigningRequest {
  intentId: string;
  token: string;
  returnUrl?: string;
}

export function parseFragment(): SigningRequest | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  clearFragment();

  try {
    const json = JSON.parse(atob(hash));
    if (!json.intentId || !json.token) return null;
    return json as SigningRequest;
  } catch {
    return null;
  }
}

export function clearFragment(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

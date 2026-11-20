// Base64, as the signing API sends and takes key material, nonces and messages.

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

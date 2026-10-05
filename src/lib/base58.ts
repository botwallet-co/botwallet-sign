// Base58 (Bitcoin alphabet), as used for Solana addresses.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base58Decode(text: string): Uint8Array {
  let value = 0n;
  for (const c of text) {
    const digit = INDEX.get(c);
    if (digit === undefined) throw new Error('Invalid base58 character');
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xFFn));
    value >>= 8n;
  }
  // Each leading '1' stands for a leading zero byte.
  for (let i = 0; i < text.length && text[i] === '1'; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let text = '';
  while (value > 0n) {
    text = ALPHABET[Number(value % 58n)] + text;
    value /= 58n;
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) text = '1' + text;
  return text;
}

/** Decodes a Solana address, or returns null when it isn't a 32-byte base58 key. */
export function decodeAddress(address: string): Uint8Array | null {
  try {
    const bytes = base58Decode(address);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

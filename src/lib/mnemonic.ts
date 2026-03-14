import { validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { scalarFromEntropy, derivePublicShare, zeroMemory } from './frost';

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export function mnemonicToScalar(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic.trim().toLowerCase(), wordlist);
  return scalarFromEntropy(new Uint8Array(entropy));
}

export function mnemonicToPublicShare(mnemonic: string): Uint8Array {
  const scalar = mnemonicToScalar(mnemonic);
  const publicShare = derivePublicShare(scalar);
  zeroMemory(scalar);
  return publicShare;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

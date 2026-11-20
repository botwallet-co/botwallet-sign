// Key 1's 12 words (BIP39) and the FROST key share they stand for (frost.ts,
// scalarFromEntropy). tests/frost.test.ts pins the derivation to the Go CLI's vectors.

import { validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { scalarFromEntropy, zeroMemory } from './frost';

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export function mnemonicToScalar(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic.trim().toLowerCase(), wordlist);
  const entryCopy = new Uint8Array(entropy);
  zeroMemory(entropy as Uint8Array);
  return scalarFromEntropy(entryCopy);
}

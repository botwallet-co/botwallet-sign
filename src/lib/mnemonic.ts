import { validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { scalarFromEntropy, derivePublicShare, zeroMemory } from './frost';

const KNOWN_WORDS = new Set(wordlist);

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/** Splits typed or pasted text into lowercase words, dropping numbering and punctuation. */
export function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;]+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(Boolean);
}

export function isKnownWord(word: string): boolean {
  return KNOWN_WORDS.has(word);
}

/** True for words like "act" that are also the start of a longer word ("action", "actress"). */
export function isPrefixOfLongerWord(word: string): boolean {
  return wordlist.some(w => w.length > word.length && w.startsWith(word));
}

/**
 * Completes a word from its first four or more letters ("lega" → "legal"). Every word in
 * the list has different first four letters, so they name at most one word. Returns the
 * input unchanged when it is already a word or doesn't start exactly one.
 */
export function completeWord(word: string): string {
  if (word.length < 4 || KNOWN_WORDS.has(word)) return word;
  const matches = wordlist.filter(w => w.startsWith(word));
  return matches.length === 1 ? matches[0] : word;
}

/** True when b is a with one letter changed, added or removed, or two neighbouring letters swapped. */
function oneTypoApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  if (short.length < long.length) return short.slice(i) === long.slice(i + 1);
  return short.slice(i + 1) === long.slice(i + 1)
    || (short[i] === long[i + 1] && short[i + 1] === long[i] && short.slice(i + 2) === long.slice(i + 2));
}

/**
 * Words from the list one typo away from a word that isn't in it ("legl" → "leg", "legal").
 * Empty when there are none, or more than `max`, where a list would not help.
 */
export function suggestWords(word: string, max = 3): string[] {
  if (!word || KNOWN_WORDS.has(word)) return [];
  const found = wordlist.filter(w => oneTypoApart(word, w));
  return found.length <= max ? found : [];
}

export const KEY1_WORD_COUNT = 12;

/**
 * What to tell the owner when entered words can't go into the Key 1 boxes, or null when
 * they can: exactly 12 words fill every box, and a few words typed or pasted into a box
 * spread over the boxes after it. The paste button needs all 12. Twenty-four words are
 * the full backup (Key 1 and Key 2, enough to move the funds without Botwallet), so they
 * are refused rather than cut down to Key 1: Key 2 should never be entered on this page.
 */
export function wordCountProblem(count: number, fromButton: boolean): string | null {
  if (count === KEY1_WORD_COUNT) return null;
  if (count === KEY1_WORD_COUNT * 2) {
    return "That's 24 words, your full backup. Only Key 1 is needed here, so paste just its 12 words. Never enter Key 2 on this page.";
  }
  if (fromButton && count === 0) {
    return 'There are no words on your clipboard. Copy Key 1 first, or type the words below.';
  }
  if (fromButton || count > KEY1_WORD_COUNT) {
    return `Found ${count} word${count === 1 ? '' : 's'}. Key 1 is 12 words, so paste just those.`;
  }
  return null;
}

export function mnemonicToScalar(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic.trim().toLowerCase(), wordlist);
  const entryCopy = new Uint8Array(entropy);
  zeroMemory(entropy as Uint8Array);
  return scalarFromEntropy(entryCopy);
}

export function derivePublicShareFromScalar(scalar: Uint8Array): Uint8Array {
  return derivePublicShare(scalar);
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

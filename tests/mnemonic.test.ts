// Key 1 entry: which word counts fill the boxes, what the owner is told otherwise, and
// the help with words that aren't in the word list.

import { describe, it, expect } from 'vitest';
import { wordlist } from '@scure/bip39/wordlists/english';
import { completeWord, suggestWords, wordCountProblem } from '../src/lib/mnemonic';

describe('wordCountProblem', () => {
  it('accepts exactly 12 words from a paste, the button or a keyboard', () => {
    expect(wordCountProblem(12, true)).toBeNull();
    expect(wordCountProblem(12, false)).toBeNull();
  });

  it('refuses a 24-word backup instead of keeping the first 12', () => {
    for (const fromButton of [true, false]) {
      const message = wordCountProblem(24, fromButton);
      expect(message).toMatch(/24 words, your full backup/);
      expect(message).toMatch(/Never enter Key 2/);
    }
  });

  it('refuses any other count over 12', () => {
    for (const count of [13, 18, 23, 25, 36]) {
      expect(wordCountProblem(count, false)).toBe(`Found ${count} words. Key 1 is 12 words, so paste just those.`);
    }
  });

  it('lets a few words spread over the boxes, but the paste button needs all 12', () => {
    for (const count of [0, 1, 2, 6, 11]) expect(wordCountProblem(count, false)).toBeNull();
    expect(wordCountProblem(0, true)).toMatch(/no words on your clipboard/);
    expect(wordCountProblem(1, true)).toBe('Found 1 word. Key 1 is 12 words, so paste just those.');
    expect(wordCountProblem(6, true)).toBe('Found 6 words. Key 1 is 12 words, so paste just those.');
  });
});

describe('completeWord', () => {
  it('completes a word from its first four or more letters', () => {
    expect(completeWord('lega')).toBe('legal');
    expect(completeWord('aban')).toBe('abandon');
    expect(completeWord('abst')).toBe('abstract');
    expect(completeWord('usefu')).toBe('useful');
  });

  it('works for every word in the list', () => {
    for (const w of wordlist) expect(completeWord(w.slice(0, 4))).toBe(w);
  });

  it('leaves real words, short starts and unknown words alone', () => {
    expect(completeWord('act')).toBe('act');
    expect(completeWord('leg')).toBe('leg');
    expect(completeWord('aba')).toBe('aba');
    expect(completeWord('legl')).toBe('legl');
    expect(completeWord('legalx')).toBe('legalx');
  });
});

describe('suggestWords', () => {
  it('suggests words one typo away', () => {
    expect(suggestWords('legl')).toEqual(['leg', 'legal']); // missing letter
    expect(suggestWords('winnr')).toEqual(['winner']);
    expect(suggestWords('abandonn')).toEqual(['abandon']); // extra letter
    expect(suggestWords('sausge')).toEqual(['sausage']);
    expect(suggestWords('lgeal')).toEqual(['legal']); // swapped letters
    expect(suggestWords('thnak')).toEqual(['thank']);
    expect(suggestWords('wimner')).toEqual(['winner']); // wrong letter
  });

  it('suggests nothing for a real word or a word far from any', () => {
    expect(suggestWords('legal')).toEqual([]);
    expect(suggestWords('zzzz')).toEqual([]);
    expect(suggestWords('')).toEqual([]);
  });

  it('suggests nothing when too many words are one typo away', () => {
    expect(suggestWords('sam', 100)).toEqual(['sad', 'same', 'say', 'slam']);
    expect(suggestWords('sam')).toEqual([]);
  });
});

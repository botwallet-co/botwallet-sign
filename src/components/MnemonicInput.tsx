import { useState, useRef, useEffect } from 'react';
import {
  isValidMnemonic, splitWords, isKnownWord, isPrefixOfLongerWord, completeWord, suggestWords,
  wordCountProblem, KEY1_WORD_COUNT,
} from '../lib/mnemonic';
import { clearClipboard, clipboardMessage } from '../lib/clipboard';
import { AlertCircle, ClipboardPaste, Check, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface Props {
  onValid: (mnemonic: string) => void;
  onReset?: () => void;
  disabled?: boolean;
}

const WORD_COUNT = KEY1_WORD_COUNT;

/** Where several words at once came from: the paste button, a paste into a box, or a phone keyboard. */
type Source = 'button' | 'paste' | 'typing';

type WordCheck =
  | { ok: true; mnemonic: string }
  | { ok: false; bad: number[]; message?: string };

/** Returns null until all 12 words are filled in. Words that aren't in the word list come back in `bad`. */
function checkWords(words: string[]): WordCheck | null {
  if (words.some(w => !w)) return null;
  const bad = words.flatMap((w, i) => (isKnownWord(w) ? [] : [i]));
  if (bad.length > 0) return { ok: false, bad };
  const mnemonic = words.join(' ');
  if (!isValidMnemonic(mnemonic)) {
    return { ok: false, bad: [], message: "These 12 words aren't a valid Key 1. Check each word and the order." };
  }
  return { ok: true, mnemonic };
}

/**
 * Says which words aren't in the word list, with likely corrections. Corrections appear
 * only while the words are shown: otherwise they would put Key 1 words on screen.
 */
function WordHints({ bad, words, showWords, onShowWords, onPick }: {
  bad: number[];
  words: string[];
  showWords: boolean;
  onShowWords: () => void;
  onPick: (index: number, word: string) => void;
}) {
  const hints = bad.map(index => ({ index, suggestions: suggestWords(words[index]) }));
  const anySuggestions = hints.some(h => h.suggestions.length > 0);
  const allSuggested = hints.every(h => h.suggestions.length > 0);
  const linkClass = 'font-medium underline underline-offset-2 hover:text-red-700';

  return (
    <div role="alert" className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg animate-fade-in">
      <AlertCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
      <div className="text-xs text-status-error space-y-1">
        {hints.map(({ index, suggestions }) => (
          <p key={index}>
            Word {index + 1} isn't in the word list.
            {showWords && suggestions.length > 0 && (
              <>
                {' '}Did you mean{' '}
                {suggestions.map((s, k) => (
                  <span key={s}>
                    {k > 0 && (k === suggestions.length - 1 ? ' or ' : ', ')}
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onPick(index, s)}
                      className={`font-mono ${linkClass}`}
                    >
                      {s}
                    </button>
                  </span>
                ))}
                ?
              </>
            )}
          </p>
        ))}
        {!showWords && anySuggestions ? (
          <p>
            Check the spelling, or{' '}
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={onShowWords} className={linkClass}>
              show the words
            </button>{' '}
            to see suggestions.
          </p>
        ) : !(showWords && allSuggested) && (
          <p>Check the spelling.</p>
        )}
      </div>
    </div>
  );
}

export default function MnemonicInput({ onValid, onReset, disabled }: Props) {
  const [words, setWords] = useState<string[]>(() => Array(WORD_COUNT).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [badWords, setBadWords] = useState<number[]>([]);
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);
  const [showWords, setShowWords] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Latest words, for blur and key handlers that can fire before React re-renders.
  const wordsRef = useRef(words);

  useEffect(() => {
    if (!accepted) {
      inputRefs.current[0]?.focus();
    }
  }, []);

  const updateWords = (next: string[]) => {
    wordsRef.current = next;
    setWords(next);
  };

  // Accepts the words if they are a valid Key 1, otherwise says what is wrong.
  // Does nothing until all 12 words are filled in.
  const commit = (next: string[]) => {
    const result = checkWords(next);
    if (!result) return;
    if (result.ok) {
      setError(null);
      setBadWords([]);
      setAccepted(true);
      onValid(result.mnemonic);
      // The parent keeps the accepted words; drop this copy. Strings can't be wiped, so this
      // only removes a reference. "Change" starts over with empty fields anyway.
      updateWords(Array(WORD_COUNT).fill(''));
    } else {
      setError(result.message ?? null);
      setBadWords(result.bad);
    }
  };

  // Checks a word once the owner has finished it, instead of only after all 12 are in:
  // completes it from its first four letters ("lega" → "legal"), or flags it when it
  // isn't in the word list. Returns the words after any completion.
  const finishWord = (index: number, current: string[] = wordsRef.current): string[] => {
    const word = current[index];
    if (!word || isKnownWord(word)) return current;
    const full = completeWord(word);
    if (full !== word) {
      const next = [...current];
      next[index] = full;
      updateWords(next);
      return next;
    }
    setBadWords(prev => (prev.includes(index) ? prev : [...prev, index]));
    return current;
  };

  const applySuggestion = (index: number, word: string) => {
    const next = [...wordsRef.current];
    next[index] = word;
    updateWords(next);
    setError(null);
    setBadWords(prev => prev.filter(i => i !== index));
    commit(next);
  };

  // Pasted words are in the boxes now (or were a refused full backup), so they shouldn't
  // stay on the clipboard, where clipboard history and other apps can read them. Runs
  // while the click or paste still lets the page write to the clipboard.
  const clearPastedWords = (fullBackup: boolean) => {
    clearClipboard().then(cleared => setClipboardNote(clipboardMessage(cleared, fullBackup)));
  };

  // Handles several words at once, from a paste or a mobile keyboard. Exactly 12 words
  // fill every field; other counts are refused without filling anything (see
  // wordCountProblem), except a few words, which go into this field and the next ones.
  // Returns false for a single word.
  const enterWords = (text: string, index: number, source: Source): boolean => {
    const entered = splitWords(text).map(completeWord);
    const pasted = source !== 'typing';

    const problem = wordCountProblem(entered.length, source === 'button');
    if (problem) {
      setError(problem);
      if (pasted && entered.length === WORD_COUNT * 2) clearPastedWords(true);
      return true;
    }

    if (entered.length === WORD_COUNT) {
      updateWords(entered);
      commit(entered);
      if (pasted) clearPastedWords(false);
      return true;
    }

    if (entered.length <= 1) return false;

    // A few words: spread them over this field and the ones after it, flagging any
    // that aren't in the word list.
    const next = [...wordsRef.current];
    const placed = entered.slice(0, WORD_COUNT - index);
    placed.forEach((w, k) => { next[index + k] = w; });
    updateWords(next);
    setError(null);
    setBadWords(prev => [
      ...prev.filter(i => i < index || i >= index + placed.length),
      ...placed.flatMap((w, k) => (isKnownWord(w) ? [] : [index + k])),
    ]);
    commit(next);
    if (pasted) clearPastedWords(false);
    inputRefs.current[Math.min(index + entered.length, WORD_COUNT - 1)]?.focus();
    return true;
  };

  const handleWordChange = (index: number, value: string) => {
    if (disabled || accepted) return;

    // Mobile keyboards often type the space (or a whole phrase) into the field
    // instead of sending key events.
    const typed = splitWords(value);
    if (typed.length > 1) {
      enterWords(value, index, 'typing');
      return;
    }

    const word = typed[0] ?? '';
    const finished = word !== '' && /[\s,;]$/.test(value);
    let next = [...wordsRef.current];
    next[index] = word;
    updateWords(next);
    setError(null);
    setBadWords(prev => prev.filter(i => i !== index));
    if (finished) next = finishWord(index, next);

    // Accept as soon as the words are valid, unless this word could still grow into
    // a longer one ("act" → "actress"); that waits until the word is finished.
    const result = checkWords(next);
    if (result?.ok && (finished || !isPrefixOfLongerWord(word))) {
      commit(next);
    } else if (finished && index < WORD_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (finished) {
      commit(next);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === ',') {
      e.preventDefault();
      const next = finishWord(index);
      if (index < WORD_COUNT - 1) inputRefs.current[index + 1]?.focus();
      else commit(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(finishWord(index));
    } else if (e.key === 'Backspace' && !wordsRef.current[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Check the words when the owner leaves a field, but not when they only switch
  // to another window or tab (to look up a word, for example).
  const handleBlur = (index: number) => {
    if (disabled || accepted || !document.hasFocus()) return;
    commit(finishWord(index));
  };

  const handleInputPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled || accepted) return;
    if (enterWords(e.clipboardData.getData('text'), index, 'paste')) e.preventDefault();
  };

  const handlePasteButton = async () => {
    if (disabled || accepted) return;
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError("Couldn't read your clipboard. Paste into the first box below, or type the words.");
      return;
    }
    enterWords(text, 0, 'button');
  };

  const handleReset = () => {
    setAccepted(false);
    updateWords(Array(WORD_COUNT).fill(''));
    setError(null);
    setBadWords([]);
    setClipboardNote(null);
    setShowWords(false);
    onReset?.();
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  // ── Accepted state ──
  if (accepted) {
    return (
      <div className="animate-fade-in">
        <div className="bg-green-50 border border-green-200 rounded-[14px] p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-status-success" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-green-800">Key 1 accepted</div>
            <div className="text-xs text-green-600 mt-0.5">12 words checked · Ready to sign</div>
            {clipboardNote && <div className="text-xs text-green-700 mt-1.5">{clipboardNote}</div>}
          </div>
          <button
            onClick={handleReset}
            disabled={disabled}
            className="text-xs text-green-600 hover:text-green-800 transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Change
          </button>
        </div>
      </div>
    );
  }

  // ── Input state ──
  return (
    <div>
      {/* Paste button */}
      <button
        onClick={handlePasteButton}
        disabled={disabled}
        className="w-full py-6 px-5 border-2 border-dashed border-cream-dark rounded-[14px]
          hover:border-warm-gray-light hover:bg-cream/30 transition-all text-center
          disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        <ClipboardPaste className="w-5 h-5 text-warm-gray-light group-hover:text-warm-gray transition-colors mx-auto mb-2" />
        <div className="text-sm font-medium text-warm-gray group-hover:text-warm-black transition-colors">
          Paste Key 1 (12 words)
        </div>
      </button>

      {/* Divider label */}
      <div className="w-full mt-3 mb-3 text-[12px] text-warm-gray-light text-center">
        Or enter words manually
      </div>

      {/* Grid — always visible */}
      <div>
        <div className="flex items-center justify-end gap-1 mb-2">
          <button
            onClick={handlePasteButton}
            onMouseDown={e => e.preventDefault()}
            disabled={disabled}
            className="p-1 rounded-md hover:bg-cream transition-colors text-warm-gray-light hover:text-warm-gray disabled:opacity-50"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowWords(!showWords)}
            onMouseDown={e => e.preventDefault()}
            className="p-1 rounded-md hover:bg-cream transition-colors text-warm-gray-light hover:text-warm-gray"
            title={showWords ? 'Hide words' : 'Show words'}
          >
            {showWords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {words.map((word, i) => {
            const isBad = badWords.includes(i);
            return (
              <div key={i} className="relative">
                <span className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 text-[10px] sm:text-[11px] text-warm-gray-light font-mono select-none pointer-events-none">
                  {i + 1}.
                </span>
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type={showWords ? 'text' : 'password'}
                  value={word}
                  onChange={e => handleWordChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={e => handleInputPaste(i, e)}
                  onBlur={() => handleBlur(i)}
                  disabled={disabled}
                  aria-label={`Word ${i + 1}`}
                  aria-invalid={isBad || undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-1p-ignore
                  data-lpignore="true"
                  className={`w-full pl-7 sm:pl-8 pr-2 py-2 text-sm font-mono border rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-warm-black/20 focus:border-warm-black/30
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                    isBad ? 'bg-red-50 border-status-error/50' : 'bg-cream border-cream-dark'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {badWords.length > 0 && (
        <WordHints
          bad={[...badWords].sort((a, b) => a - b)}
          words={words}
          showWords={showWords}
          onShowWords={() => setShowWords(true)}
          onPick={applySuggestion}
        />
      )}

      {/* Error message */}
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg animate-fade-in">
          <AlertCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
          <span className="text-xs text-status-error">{error}</span>
        </div>
      )}

      {clipboardNote && (
        <p className="mt-3 text-xs text-warm-gray leading-relaxed">{clipboardNote}</p>
      )}
    </div>
  );
}

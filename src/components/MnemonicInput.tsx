import { useState, useRef, useEffect, useCallback } from 'react';
import { isValidMnemonic } from '../lib/mnemonic';
import { AlertCircle, Eye, EyeOff, ClipboardPaste } from 'lucide-react';

interface Props {
  onValid: (mnemonic: string) => void;
  disabled?: boolean;
}

export default function MnemonicInput({ onValid, disabled }: Props) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [showWords, setShowWords] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const checkComplete = useCallback((updatedWords: string[]) => {
    const filled = updatedWords.filter(w => w.trim()).length;
    if (filled < 12) {
      setError(null);
      return;
    }
    const mnemonic = updatedWords.map(w => w.trim().toLowerCase()).join(' ');
    if (isValidMnemonic(mnemonic)) {
      setError(null);
      onValid(mnemonic);
    } else {
      setError('Invalid recovery phrase. Please check each word carefully.');
    }
  }, [onValid]);

  const handleWordChange = (index: number, value: string) => {
    if (disabled) return;
    const cleaned = value.toLowerCase().replace(/[^a-z]/g, '');
    const updated = [...words];
    updated[index] = cleaned;
    setWords(updated);
    checkComplete(updated);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Tab') {
      e.preventDefault();
      if (index < 11) inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Backspace' && !words[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleInputPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const text = e.clipboardData.getData('text');
    const pastedWords = text.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (pastedWords.length <= 1) return;

    e.preventDefault();

    if (pastedWords.length === 12 && index === 0) {
      setWords(pastedWords);
      checkComplete(pastedWords);
      inputRefs.current[11]?.focus();
      return;
    }

    if (pastedWords.length === 24 && index === 0) {
      setError('Please enter only Key 1 (S1) — the first 12 words from your agent backup.');
      return;
    }

    const updated = [...words];
    const count = Math.min(pastedWords.length, 12 - index);
    for (let i = 0; i < count; i++) {
      updated[index + i] = pastedWords[i].replace(/[^a-z]/g, '');
    }
    setWords(updated);
    checkComplete(updated);
    const focusIdx = Math.min(index + count, 11);
    inputRefs.current[focusIdx]?.focus();
  };

  const handlePaste = async () => {
    if (disabled) return;
    try {
      const text = await navigator.clipboard.readText();
      const pastedWords = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (pastedWords.length === 12) {
        setWords(pastedWords);
        checkComplete(pastedWords);
      } else if (pastedWords.length === 24) {
        setError('Please enter only Key 1 (S1) — the first 12 words from your agent backup.');
      } else {
        setError(`Expected 12 words, got ${pastedWords.length}. Paste your S1 recovery phrase.`);
      }
    } catch {
      setError('Could not read clipboard. Please paste words individually.');
    }
  };

  return (
    <div className="bg-white rounded-card-lg border border-cream-dark shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-cream-dark bg-cream/50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-warm-black">
            Recovery Phrase
          </h2>
          <p className="text-[11px] text-warm-gray-light mt-0.5">
            Key 1 (S1) — 12 words from your agent backup
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePaste}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-cream transition-colors text-warm-gray hover:text-warm-black disabled:opacity-50"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowWords(!showWords)}
            className="p-1.5 rounded-lg hover:bg-cream transition-colors text-warm-gray hover:text-warm-black"
            title={showWords ? 'Hide words' : 'Show words'}
          >
            {showWords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2">
          {words.map((word, i) => (
            <div key={i} className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-warm-gray-light font-mono select-none pointer-events-none">
                {i + 1}.
              </span>
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                type={showWords ? 'text' : 'password'}
                value={word}
                onChange={e => handleWordChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={e => handleInputPaste(i, e)}
                disabled={disabled}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-1p-ignore
                data-lpignore="true"
                className="w-full pl-8 pr-2 py-2 text-sm font-mono bg-cream border border-cream-dark rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-warm-black/20 focus:border-warm-black/30
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
            <span className="text-xs text-status-error">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

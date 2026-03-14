import { useState, useRef, useEffect, useCallback } from 'react';
import { isValidMnemonic } from '../lib/mnemonic';
import { AlertCircle, ClipboardPaste, Check, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface Props {
  onValid: (mnemonic: string) => void;
  onReset?: () => void;
  disabled?: boolean;
}

export default function MnemonicInput({ onValid, onReset, disabled }: Props) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [showWords, setShowWords] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!accepted) {
      inputRefs.current[0]?.focus();
    }
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
      setAccepted(true);
      onValid(mnemonic);
    } else {
      setError('Invalid recovery phrase. Please check each word carefully.');
    }
  }, [onValid]);

  const handleWordChange = (index: number, value: string) => {
    if (disabled || accepted) return;
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
    if (disabled || accepted) return;
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

  const handlePasteButton = async () => {
    if (disabled || accepted) return;
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
      setError('Could not read clipboard. Please enter words manually.');
    }
  };

  const handleReset = () => {
    setAccepted(false);
    setWords(Array(12).fill(''));
    setError(null);
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
            <div className="text-sm font-medium text-green-800">Recovery phrase accepted</div>
            <div className="text-xs text-green-600 mt-0.5">12 words verified · Ready to sign</div>
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
          Paste your recovery phrase
        </div>
        <div className="text-xs text-warm-gray-light mt-1">Key 1 (S1) · 12 words</div>
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
            disabled={disabled}
            className="p-1 rounded-md hover:bg-cream transition-colors text-warm-gray-light hover:text-warm-gray disabled:opacity-50"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowWords(!showWords)}
            className="p-1 rounded-md hover:bg-cream transition-colors text-warm-gray-light hover:text-warm-gray"
            title={showWords ? 'Hide words' : 'Show words'}
          >
            {showWords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

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
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg animate-fade-in">
          <AlertCircle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
          <span className="text-xs text-status-error">{error}</span>
        </div>
      )}
    </div>
  );
}

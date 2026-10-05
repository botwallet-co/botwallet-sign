import { useId } from 'react';
import { XCircle, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import type { Failure } from '../lib/errors';
import { clearStoredSession, DEFAULT_RETURN_URL } from '../lib/fragment';

interface Props {
  failure: Failure;
  returnUrl?: string;
  onRetry?: () => void;
}

export default function ErrorView({ failure, returnUrl, onRetry }: Props) {
  const isWarning = failure.tone === 'warning';
  const id = useId();

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm text-center animate-slide-up">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
          isWarning ? 'bg-status-warning/10' : 'bg-status-error/10'
        }`}>
          {isWarning ? (
            <AlertTriangle className="w-7 h-7 text-status-warning" />
          ) : (
            <XCircle className="w-7 h-7 text-status-error" />
          )}
        </div>

        {/* Focused when this screen appears (SigningFlow), so the title and both lines are read out */}
        <h1
          tabIndex={-1}
          data-stage-heading
          aria-describedby={`${id}-message ${id}-next`}
          className="text-lg font-semibold text-warm-black mb-2 outline-none"
        >
          {failure.title}
        </h1>

        <p id={`${id}-message`} className="text-sm text-warm-gray max-w-sm mx-auto">{failure.message}</p>
        <p id={`${id}-next`} className="text-sm text-warm-black max-w-sm mx-auto mt-2">{failure.next}</p>

        {failure.code && (
          <p className="text-[11px] text-warm-gray-light font-mono mt-4">Error code: {failure.code}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-4">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-[14px] font-semibold text-sm
              bg-warm-black text-white hover:bg-warm-black/90 transition-colors active:scale-[0.99]"
          >
            <RotateCcw className="w-4 h-4" />
            {failure.retryLabel ?? 'Try Again'}
          </button>
        )}
        <a
          href={returnUrl || DEFAULT_RETURN_URL}
          onClick={clearStoredSession}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-[14px] font-semibold text-sm transition-colors ${
            onRetry
              ? 'border border-cream-dark text-warm-black hover:bg-cream'
              : 'bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

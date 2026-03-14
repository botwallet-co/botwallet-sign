import { XCircle, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';

interface Props {
  message: string;
  code?: string;
  returnUrl?: string;
  onRetry?: () => void;
}

export default function ErrorView({ message, code, returnUrl, onRetry }: Props) {
  const isKeyMismatch = code === 'KEY_MISMATCH';
  const isExpired = code === 'INTENT_EXPIRED' || code === 'INTENT_COMPLETED';

  return (
    <div className="text-center py-12">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
        isKeyMismatch ? 'bg-status-warning/10' : 'bg-status-error/10'
      }`}>
        {isKeyMismatch ? (
          <AlertTriangle className="w-7 h-7 text-status-warning" />
        ) : (
          <XCircle className="w-7 h-7 text-status-error" />
        )}
      </div>

      <h1 className="text-lg font-semibold text-warm-black mb-2">
        {isKeyMismatch ? 'Wrong Recovery Phrase' : isExpired ? 'Session Expired' : 'Transaction Failed'}
      </h1>

      <p className="text-sm text-warm-gray max-w-sm mx-auto mb-6">{message}</p>

      {isKeyMismatch && (
        <p className="text-xs text-warm-gray-light max-w-sm mx-auto mb-6">
          Your funds are safe — nothing was sent. Double-check you are entering Key 1 (S1) from your
          agent backup, not Key 2.
        </p>
      )}

      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-lg font-semibold text-sm
              bg-warm-black text-white hover:bg-warm-black/90 transition-colors active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
        )}
        <a
          href={returnUrl || 'https://app.botwallet.co'}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-card-lg font-semibold text-sm
            border border-cream-dark text-warm-black hover:bg-cream transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

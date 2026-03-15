import { ExternalLink, ArrowLeft, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { FrostCompleteResult, SigningIntentDetails } from '../lib/api';
import { shortenAddress } from '../lib/format';

interface Props {
  result: FrostCompleteResult;
  details: SigningIntentDetails;
  returnUrl?: string;
}

function AnimatedCheckmark() {
  return (
    <div className="success-checkmark-container">
      <svg className="success-checkmark" viewBox="0 0 56 56" fill="none">
        <circle
          className="success-circle"
          cx="28" cy="28" r="25"
          stroke="#22c55e"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          className="success-check"
          d="M17 28.5L24.5 36L39 21.5"
          stroke="#22c55e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <div className="success-burst" />
    </div>
  );
}

export default function SuccessView({ result, details, returnUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowReceipt(true), 900);
    return () => clearTimeout(timer);
  }, []);

  const copySignature = async () => {
    await navigator.clipboard.writeText(result.solana_signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTransfer = details.action_type === 'transfer';

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm text-center">
        <div className="flex items-center justify-center mb-5 mt-2">
          <AnimatedCheckmark />
        </div>

        <h1 className="text-[22px] font-semibold text-warm-black mb-1 success-text-reveal">
          Transaction Complete
        </h1>
        <p className="text-sm text-warm-gray success-text-reveal-delayed">
          {isTransfer ? 'Transfer' : 'Withdrawal'} of <span className="font-mono font-semibold text-warm-black">${result.amount_usdc}</span> USDC sent successfully.
        </p>

        <div className={`text-left space-y-2.5 pt-5 mt-5 border-t border-cream-dark transition-all duration-500 ${
          showReceipt ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">Amount</span>
            <span className="font-semibold text-warm-black">${result.amount_usdc} USDC</span>
          </div>
          {parseFloat(result.fee_usdc) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-gray">Fee</span>
              <span className="text-warm-black">${result.fee_usdc} USDC</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">To</span>
            <span className="font-mono text-warm-black">{shortenAddress(details.to_address, 6)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">New Balance</span>
            <span className="font-semibold text-warm-black">${result.new_balance_usdc} USDC</span>
          </div>

          <div className="pt-3 border-t border-cream-dark">
            <div className="flex items-center justify-between">
              <a
                href={result.explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-warm-gray hover:text-warm-black transition-colors"
              >
                View transaction
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={copySignature}
                className="flex items-center gap-1.5 text-xs text-warm-gray-light hover:text-warm-black transition-colors font-mono"
              >
                {shortenAddress(result.solana_signature, 8)}
                {copied ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <a
        href={returnUrl || 'https://app.botwallet.co'}
        className={`w-full mt-4 py-3.5 px-4 rounded-[14px] font-semibold text-sm text-center
          bg-warm-black text-white hover:bg-warm-black/90 transition-all active:scale-[0.99]
          flex items-center justify-center gap-2 duration-500 ${
          showReceipt ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Dashboard
      </a>
    </div>
  );
}

import { CheckCircle2, ExternalLink, ArrowLeft, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { FrostCompleteResult, SigningIntentDetails } from '../lib/api';
import { shortenAddress } from '../lib/format';

interface Props {
  result: FrostCompleteResult;
  details: SigningIntentDetails;
  returnUrl?: string;
}

export default function SuccessView({ result, details, returnUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const copySignature = async () => {
    await navigator.clipboard.writeText(result.solana_signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-status-success" />
        </div>
        <h1 className="text-xl font-semibold text-warm-black mb-1">
          Transaction Submitted
        </h1>
        <p className="text-sm text-warm-gray">
          Your {details.action_type === 'transfer' ? 'transfer' : 'withdrawal'} has been successfully signed and submitted to the Solana network.
        </p>
      </div>

      <div className="bg-white rounded-card-lg border border-cream-dark shadow-sm p-5 space-y-3">
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

        <div className="pt-2 border-t border-cream-dark">
          <div className="flex items-center justify-between">
            <a
              href={result.explorer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-warm-gray hover:text-warm-black transition-colors group"
            >
              <span>View on Solscan</span>
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

      <a
        href={returnUrl || 'https://app.botwallet.co'}
        className="w-full py-3.5 px-4 rounded-card-lg font-semibold text-sm text-center
          bg-warm-black text-white hover:bg-warm-black/90 transition-colors active:scale-[0.98]
          flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Dashboard
      </a>
    </div>
  );
}

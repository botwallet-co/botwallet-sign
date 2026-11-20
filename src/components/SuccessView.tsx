import { ExternalLink, ArrowLeft, Copy, Check } from 'lucide-react';
import { useState, useEffect, useId } from 'react';
import type { SigningIntentDetails } from '../lib/api';
import { kindTitle, type ActionKind } from '../lib/action';
import { shortenMiddle, transactionExplorerUrl } from '../lib/format';
import type { Receipt } from '../lib/receipt';
import { usdcToCents } from '../lib/usdc';
import { useCopy } from '../hooks/useCopy';
import { Card, DashboardLink, StageHeading } from './ui';

interface Props {
  receipt: Receipt;
  details: SigningIntentDetails;
  kind: ActionKind;
  dashboardUrl: string;
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

export default function SuccessView({ receipt, details, kind, dashboardUrl }: Props) {
  const { copied, copy } = useCopy();
  const [showReceipt, setShowReceipt] = useState(false);
  const summaryId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setShowReceipt(true), 900);
    return () => clearTimeout(timer);
  }, []);

  const { signature } = receipt;
  const explorerUrl = signature ? transactionExplorerUrl(signature, details.network) : null;

  return (
    <div className="animate-fade-in">
      <Card className="p-7 text-center">
        <div className="flex items-center justify-center mb-5 mt-2">
          <AnimatedCheckmark />
        </div>

        <StageHeading
          aria-describedby={summaryId}
          className="text-[22px] font-semibold text-warm-black mb-1 success-text-reveal"
        >
          Transaction Complete
        </StageHeading>
        <p id={summaryId} className="text-sm text-warm-gray success-text-reveal-delayed">
          {kindTitle(kind)} of <span className="font-mono font-semibold text-warm-black">${receipt.amountUsdc}</span> USDC sent successfully.
        </p>

        <div className={`text-left space-y-2.5 pt-5 mt-5 border-t border-cream-dark transition-all duration-500 ${
          showReceipt ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">Amount</span>
            <span className="font-semibold text-warm-black">${receipt.amountUsdc} USDC</span>
          </div>
          {(usdcToCents(receipt.feeUsdc) ?? 0n) > 0n && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-gray">Fee</span>
              <span className="text-warm-black">${receipt.feeUsdc} USDC</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">To</span>
            <span className="font-mono text-warm-black">{shortenMiddle(details.to_address, 6)}</span>
          </div>
          {receipt.newBalanceUsdc && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-gray">New Balance</span>
              <span className="font-semibold text-warm-black">${receipt.newBalanceUsdc} USDC</span>
            </div>
          )}

          {signature !== null && (
            <div className="pt-3 border-t border-cream-dark">
              <div className="flex items-center justify-between">
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-warm-gray hover:text-warm-black transition-colors"
                  >
                    View transaction
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => copy(signature)}
                  className="ml-auto flex items-center gap-1.5 text-xs text-warm-gray-light hover:text-warm-black transition-colors font-mono"
                >
                  {shortenMiddle(signature, 8)}
                  {copied ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <DashboardLink
        href={dashboardUrl}
        signed
        variant="primary"
        className={`w-full mt-4 px-4 text-center transition-all duration-500 ${
          showReceipt ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Dashboard
      </DashboardLink>
    </div>
  );
}

import { ArrowDown, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { shortenAddress } from '../lib/format';
import type { SigningIntentDetails } from '../lib/api';

interface Props {
  details: SigningIntentDetails;
}

export default function TransactionCard({ details }: Props) {
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  const totalAmount = (parseFloat(details.amount) + parseFloat(details.fee_usdc)).toFixed(2);
  const isTransfer = details.action_type === 'transfer';

  return (
    <div className="bg-white rounded-card-lg border border-cream-dark shadow-sm overflow-hidden">
      {/* Amount — the hero */}
      <div className="px-5 pt-5 pb-4 text-center">
        <span className="text-3xl font-semibold text-warm-black font-mono">
          ${details.amount}
        </span>
        <span className="text-base text-warm-gray ml-1.5">USDC</span>
      </div>

      {/* From → To */}
      <div className="px-5 pb-5 space-y-2">
        <div className="bg-cream rounded-card px-3.5 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-warm-gray-light uppercase tracking-wide">From</div>
            <div className="font-medium text-warm-black text-sm mt-0.5">{details.from_name}</div>
          </div>
          <div className="text-xs text-warm-gray font-mono">{shortenAddress(details.from_address, 4)}</div>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-3.5 h-3.5 text-warm-gray-light" />
        </div>

        <div className="bg-cream rounded-card px-3.5 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-warm-gray-light uppercase tracking-wide">To</div>
            <div className="font-medium text-warm-black text-sm mt-0.5">
              {details.to_name || (isTransfer ? 'External Wallet' : 'External Address')}
            </div>
          </div>
          <div className="text-xs text-warm-gray font-mono">{shortenAddress(details.to_address, 4)}</div>
        </div>

        {/* Fees */}
        <div className="pt-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-gray">{isTransfer ? 'Transfer' : 'Withdrawal'} Amount</span>
            <span className="text-warm-black font-mono">${details.amount}</span>
          </div>
          {parseFloat(details.fee_usdc) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setShowFeeBreakdown(!showFeeBreakdown)}
                className="flex items-center gap-1 text-warm-gray hover:text-warm-black transition-colors"
              >
                <span>Platform Fee</span>
                <Info className="w-3.5 h-3.5" />
                {showFeeBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span className="text-warm-black font-mono">${details.fee_usdc}</span>
            </div>
          )}
          {showFeeBreakdown && (
            <div className="p-2.5 bg-cream rounded-lg text-xs text-warm-gray space-y-1">
              <div className="flex justify-between">
                <span>Platform fee</span>
                <span className="font-mono">${details.fee_usdc} USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Solana network fee</span>
                <span className="text-status-success">Covered by BotWallet</span>
              </div>
              <div className="flex justify-between">
                <span>Token account setup</span>
                <span className="text-status-success">Covered by BotWallet</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-semibold pt-1.5 border-t border-cream-dark">
            <span className="text-warm-black">Total Deducted</span>
            <span className="text-warm-black font-mono">${totalAmount}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

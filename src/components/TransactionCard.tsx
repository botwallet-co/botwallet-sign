import { ArrowDown, Info, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { shortenAddress } from '../lib/format';
import type { SigningIntentDetails } from '../lib/api';

interface Props {
  details: SigningIntentDetails;
}

function AddressRow({ label, name, ownerName, address }: {
  label: string;
  name: string;
  ownerName?: string | null;
  address: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-cream rounded-card overflow-hidden">
      <div className="px-4 py-3">
        <div className="text-[11px] text-warm-gray-light uppercase tracking-wide mb-1.5">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-warm-black text-sm">{name}</div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-warm-gray font-mono">{shortenAddress(address, 4)}</span>
            <button
              onClick={() => setExpanded(!expanded)}
              className={`p-1 rounded-md transition-colors ${
                expanded
                  ? 'bg-warm-black/5 text-warm-black'
                  : 'text-warm-gray-light hover:text-warm-gray hover:bg-cream-dark/50'
              }`}
              title="Show full address"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 animate-fade-in space-y-2">
          <div className="flex items-center gap-2 bg-white rounded-lg border border-cream-dark px-3 py-2">
            <span className="text-[11px] font-mono text-warm-gray break-all leading-relaxed flex-1">
              {address}
            </span>
            <button
              onClick={copyAddress}
              className="p-1 rounded-md text-warm-gray-light hover:text-warm-black hover:bg-cream transition-colors shrink-0"
              title="Copy address"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {ownerName && (
            <div className="flex items-center gap-2 text-xs text-warm-gray px-1">
              <span className="text-warm-gray-light">Owner</span>
              <span className="font-medium text-warm-black">{ownerName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TransactionCard({ details }: Props) {
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  const totalAmount = (parseFloat(details.amount) + parseFloat(details.fee_usdc)).toFixed(2);
  const isTransfer = details.action_type === 'transfer';

  return (
    <div>
      {/* Amount — hero */}
      <div className="text-center py-6 bg-cream rounded-[16px] mb-5">
        <span className="text-[40px] font-semibold text-warm-black font-mono leading-none">
          ${details.amount}
        </span>
        <span className="text-lg text-warm-gray ml-2">USDC</span>
      </div>

      {/* From → To */}
      <div className="space-y-2.5">
        <AddressRow
          label="From"
          name={details.from_name}
          ownerName={details.from_owner_name}
          address={details.from_address}
        />

        <div className="flex justify-center">
          <ArrowDown className="w-3.5 h-3.5 text-warm-gray-light" />
        </div>

        <AddressRow
          label="To"
          name={details.to_name || (isTransfer ? 'External Wallet' : 'External Address')}
          ownerName={details.to_owner_name}
          address={details.to_address}
        />
      </div>

      {/* Fees */}
      <div className="mt-5 pt-4 border-t border-cream-dark space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-gray">{isTransfer ? 'Transfer' : 'Withdrawal'}</span>
          <span className="text-warm-black font-mono">${details.amount}</span>
        </div>
        {parseFloat(details.fee_usdc) > 0 && (
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => setShowFeeBreakdown(!showFeeBreakdown)}
              className="flex items-center gap-1 text-warm-gray hover:text-warm-black transition-colors"
            >
              <span>Fee</span>
              <Info className="w-3 h-3" />
              {showFeeBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <span className="text-warm-black font-mono">${details.fee_usdc}</span>
          </div>
        )}
        {showFeeBreakdown && (
          <div className="p-2.5 bg-cream rounded-lg text-xs text-warm-gray space-y-1 animate-fade-in">
            <div className="flex justify-between">
              <span>Platform fee</span>
              <span className="font-mono">
                ${details.fee_breakdown?.platform_fee_usdc || details.fee_usdc} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span>Solana network fee</span>
              <span className="text-status-success">Covered by BotWallet</span>
            </div>
            <div className="flex justify-between">
              <span>Account setup</span>
              {details.fee_breakdown && parseFloat(details.fee_breakdown.account_setup_fee_usdc) > 0 ? (
                <span className="font-mono">
                  ${details.fee_breakdown.account_setup_fee_usdc} USDC
                  <span className="text-warm-gray ml-1 font-sans">(one-time)</span>
                </span>
              ) : (
                <span className="text-status-success">Not needed</span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-[15px] font-semibold pt-2.5 border-t border-cream-dark">
          <span className="text-warm-black">Total</span>
          <span className="text-warm-black font-mono">${totalAmount}</span>
        </div>
      </div>
    </div>
  );
}

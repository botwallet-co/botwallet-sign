import { ArrowDown, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { shortenAddress, groupAddress, summarizeFees } from '../lib/format';
import type { SigningIntentDetails } from '../lib/api';

interface Props {
  details: SigningIntentDetails;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      onClick={copy}
      className="p-1 rounded-md text-warm-gray-light hover:text-warm-black hover:bg-cream transition-colors shrink-0"
      title="Copy address"
      aria-label={copied ? 'Address copied' : 'Copy address'}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// The recipient is always shown in full: lookalike addresses often share the first and
// last few characters. The sender can stay short, with the full address one tap away.
function AddressRow({ label, name, address, showFull = false }: {
  label: string;
  name: string;
  address: string;
  showFull?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = showFull || expanded;

  return (
    <div className="bg-cream rounded-card overflow-hidden">
      <div className="px-4 py-3">
        <div className="text-[11px] text-warm-gray-light uppercase tracking-wide mb-1.5">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-warm-black text-sm min-w-0 break-words">{name}</div>
          {!showFull && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-warm-gray font-mono">{shortenAddress(address, 4)}</span>
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide full address' : 'Show full address'}
                title={expanded ? 'Hide full address' : 'Show full address'}
                className={`p-1 rounded-md transition-colors ${
                  expanded
                    ? 'bg-warm-black/5 text-warm-black'
                    : 'text-warm-gray-light hover:text-warm-gray hover:bg-cream-dark/50'
                }`}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className={`px-4 pb-3 ${showFull ? '' : 'animate-fade-in'}`}>
          <div className="flex items-start gap-2 bg-white rounded-lg border border-cream-dark px-3 py-2">
            <span className={`font-mono break-words leading-relaxed flex-1 min-w-0 ${
              showFull ? 'text-[13px] text-warm-black' : 'text-[11px] text-warm-gray'
            }`}>
              {groupAddress(address)}
            </span>
            <CopyButton text={address} />
          </div>
          {showFull && (
            <p className="text-[11px] text-warm-gray mt-1.5 px-1">
              Check the whole address, not just the start and end.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-warm-gray">{label}</span>
      <span className="text-warm-black font-mono">${value}</span>
    </div>
  );
}

export default function TransactionCard({ details }: Props) {
  const fees = summarizeFees(details);
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
          address={details.from_address}
        />

        <div className="flex justify-center">
          <ArrowDown className="w-3.5 h-3.5 text-warm-gray-light" />
        </div>

        <AddressRow
          label="To"
          name={details.to_name || (isTransfer ? 'External Wallet' : 'External Address')}
          address={details.to_address}
          showFull
        />
      </div>

      {/* Amounts, named as on the dashboard's review step */}
      <div className="mt-5 pt-4 border-t border-cream-dark space-y-1.5">
        <AmountRow label={isTransfer ? 'You transfer' : 'You withdraw'} value={fees.amount} />
        <AmountRow label="Botwallet fee" value={fees.botwalletFee} />
        {fees.setupFee && <AmountRow label="Account setup (one-time)" value={fees.setupFee} />}
        <div className="flex items-center justify-between text-xs">
          <span className="text-warm-gray">Solana network fee</span>
          <span className="text-status-success">Covered by Botwallet</span>
        </div>
        <div className="flex items-center justify-between text-[15px] font-semibold pt-2.5 border-t border-cream-dark">
          <span className="text-warm-black">Total from this wallet</span>
          <span className="text-warm-black font-mono">{fees.total ? `$${fees.total}` : '—'}</span>
        </div>
        <AmountRow label={isTransfer ? 'Arrives in the other wallet' : 'They receive'} value={fees.amount} />
      </div>
    </div>
  );
}

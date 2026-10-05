import { useEffect, useId, useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import type { Confirmation } from '../lib/confirming';
import type { ActionKind } from '../lib/errors';
import { shortenAddress, transactionExplorerUrl } from '../lib/format';
import { clearStoredSession, DEFAULT_RETURN_URL } from '../lib/fragment';

interface Props {
  kind: ActionKind;
  /** The amount sent, e.g. "12.00". */
  amount: string;
  /** The transaction's Solana signature, when the server sent it. */
  signature: string | null;
  network: string;
  returnUrl?: string;
  /** Asks Botwallet how the transfer stands. Never throws. */
  check: () => Promise<Confirmation>;
  /** Called once Botwallet knows how it ended, or can't tell anymore. */
  onSettled: (outcome: Exclude<Confirmation, 'confirming'>) => void;
}

const CHECK_EVERY = 5_000;
// Solana confirms or drops a transaction within about two minutes of sending. Past this the
// page stops asking by itself and offers to check again.
const KEEP_CHECKING_FOR = 3 * 60_000;

/**
 * Shown when the transfer was sent to Solana but not confirmed before Botwallet replied.
 * It may still go through, so this isn't an error: it says so, keeps the explorer link,
 * and checks every few seconds until Botwallet knows the result.
 */
export default function ConfirmingView({ kind, amount, signature, network, returnUrl, check, onSettled }: Props) {
  // Bumped by "Check Again" to start checking anew
  const [round, setRound] = useState(0);
  const [checking, setChecking] = useState(true);
  const summaryId = useId();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const until = Date.now() + KEEP_CHECKING_FOR;

    const run = async () => {
      const outcome = await check();
      if (cancelled) return;
      if (outcome !== 'confirming') {
        onSettled(outcome);
      } else if (Date.now() >= until) {
        setChecking(false);
      } else {
        timer = setTimeout(run, CHECK_EVERY);
      }
    };

    setChecking(true);
    timer = setTimeout(run, CHECK_EVERY);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [round]);

  const explorerUrl = signature ? transactionExplorerUrl(signature, network) : null;

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-cream-dark/60 flex items-center justify-center mx-auto mb-4">
          {checking
            ? <Loader2 className="w-6 h-6 animate-spin text-warm-gray" />
            : <Clock className="w-6 h-6 text-warm-gray" />}
        </div>

        <h1
          tabIndex={-1}
          data-stage-heading
          aria-describedby={summaryId}
          className="text-lg font-semibold text-warm-black mb-2 outline-none"
        >
          Sent — Confirming on Solana
        </h1>
        <p id={summaryId} className="text-sm text-warm-gray max-w-sm mx-auto">
          Your {kind} of <span className="font-mono font-semibold text-warm-black">${amount}</span> USDC was
          sent. Solana usually confirms it within a minute.
        </p>

        <p className="text-sm text-warm-black max-w-sm mx-auto mt-4 p-3 bg-cream rounded-lg">
          It may have gone through already, so don't send it again.
        </p>

        <p role="status" className="text-xs text-warm-gray-light mt-4">
          {checking
            ? 'Checking for confirmation…'
            : `Not confirmed yet. Check again, or look for the ${kind} in your dashboard later.`}
        </p>

        {signature && (
          <div className="flex items-center justify-between pt-3 mt-5 border-t border-cream-dark">
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
            <span className="ml-auto text-xs text-warm-gray-light font-mono">{shortenAddress(signature, 8)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-4">
        {!checking && (
          <button
            onClick={() => setRound(r => r + 1)}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-[14px] font-semibold text-sm
              bg-warm-black text-white hover:bg-warm-black/90 transition-colors active:scale-[0.99]"
          >
            <RotateCcw className="w-4 h-4" />
            Check Again
          </button>
        )}
        <a
          href={returnUrl || DEFAULT_RETURN_URL}
          onClick={clearStoredSession}
          className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-[14px] font-semibold text-sm
            border border-cream-dark text-warm-black hover:bg-cream transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

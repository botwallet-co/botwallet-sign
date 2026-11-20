import { useEffect, useId, useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import type { ActionKind } from '../lib/action';
import type { Confirmation } from '../lib/confirming';
import { shortenMiddle, transactionExplorerUrl } from '../lib/format';
import { useLatest } from '../hooks/useLatest';
import { Button, Card, DashboardLink, StageHeading } from './ui';

interface Props {
  kind: ActionKind;
  /** The amount sent, e.g. "12.00". */
  amount: string;
  /** The transaction's Solana signature, when the server sent it. */
  signature: string | null;
  network: string;
  dashboardUrl: string;
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
export default function ConfirmingView({ kind, amount, signature, network, dashboardUrl, check, onSettled }: Props) {
  // Bumped by "Check Again" to start checking anew
  const [round, setRound] = useState(0);
  const [checking, setChecking] = useState(true);
  const summaryId = useId();
  // Each round of checks runs on its own timer, so it calls whatever the parent passed last.
  const latestCheck = useLatest(check);
  const latestOnSettled = useLatest(onSettled);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const until = Date.now() + KEEP_CHECKING_FOR;

    const run = async () => {
      const outcome = await latestCheck.current();
      if (cancelled) return;
      if (outcome !== 'confirming') {
        latestOnSettled.current(outcome);
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
  }, [round, latestCheck, latestOnSettled]);

  const explorerUrl = signature ? transactionExplorerUrl(signature, network) : null;

  return (
    <div className="animate-fade-in">
      <Card className="p-7 text-center">
        <div className="w-14 h-14 rounded-full bg-cream-dark/60 flex items-center justify-center mx-auto mb-4">
          {checking
            ? <Loader2 className="w-6 h-6 animate-spin text-warm-gray" />
            : <Clock className="w-6 h-6 text-warm-gray" />}
        </div>

        <StageHeading
          aria-describedby={summaryId}
          className="text-lg font-semibold text-warm-black mb-2"
        >
          Sent — Confirming on Solana
        </StageHeading>
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
            <span className="ml-auto text-xs text-warm-gray-light font-mono">{shortenMiddle(signature, 8)}</span>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-3 mt-4">
        {!checking && (
          <Button onClick={() => setRound(r => r + 1)} className="px-4 transition-colors">
            <RotateCcw className="w-4 h-4" />
            Check Again
          </Button>
        )}
        <DashboardLink href={dashboardUrl} endSession variant="secondary" className="px-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </DashboardLink>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import type { SigningIntentDetails } from '../../lib/api';
import { kindTitle, type ActionKind } from '../../lib/action';
import { useNow } from '../../hooks/useNow';
import TransactionCard from '../TransactionCard';
import { Button, CancelLink, StageHeading } from '../ui';
import ExpiryNote from './ExpiryNote';

// Counts down to when the server frees a link whose earlier signing round is still open.
function RetryNotice({ until, kind, onReady }: { until: number; kind: ActionKind; onReady: () => void }) {
  const now = useNow(until, 1000);
  const seconds = Math.ceil((until - now) / 1000);
  const ready = seconds <= 0;

  useEffect(() => {
    if (ready) onReady();
  }, [ready, onReady]);

  return (
    <div className="mt-5 flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-900 leading-relaxed">
      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <p>
        Signing this {kind} started a moment ago, maybe in another tab. Nothing has been sent.
        You can continue in {Math.max(seconds, 1)} s.
      </p>
    </div>
  );
}

interface Props {
  details: SigningIntentDetails;
  kind: ActionKind;
  /** While an earlier signing round with this link is open, Continue waits until then. */
  retryAt: number | null;
  deadline: number | null;
  now: number;
  expired: boolean;
  dashboardUrl: string;
  onContinue: () => void;
  /** Called once retryAt has passed. Keep it stable: RetryNotice's effect depends on it. */
  onRetryReady: () => void;
}

/** Step 1: the transaction as Botwallet will send it. SigningFlow puts it in StepFrame's card. */
export default function ReviewStep({
  details, kind, retryAt, deadline, now, expired, dashboardUrl, onContinue, onRetryReady,
}: Props) {
  return (
    <>
      <p className="text-xs text-warm-gray-light uppercase tracking-[0.12em] mb-1">
        Step 1 of 2
      </p>
      <StageHeading className="text-xl font-semibold text-warm-black mb-5">
        Review {kindTitle(kind)}
      </StageHeading>

      <TransactionCard details={details} kind={kind} />

      {retryAt !== null && (
        <RetryNotice until={retryAt} kind={kind} onReady={onRetryReady} />
      )}

      <Button
        onClick={onContinue}
        disabled={expired || retryAt !== null}
        className="w-full mt-6 transition-all"
      >
        Continue to Sign
        <ChevronRight className="w-4 h-4" />
      </Button>

      <CancelLink href={dashboardUrl} />

      <div className="mt-4 text-[11px] text-warm-gray-light">
        <ExpiryNote deadline={deadline} now={now} kind={kind} />
      </div>
    </>
  );
}

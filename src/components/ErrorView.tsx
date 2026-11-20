import { useId } from 'react';
import { XCircle, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import type { Failure } from '../lib/errors';
import { Button, Card, DashboardLink, StageHeading } from './ui';

interface Props {
  failure: Failure;
  dashboardUrl: string;
  onRetry?: () => void;
}

export default function ErrorView({ failure, dashboardUrl, onRetry }: Props) {
  const isWarning = failure.tone === 'warning';
  const id = useId();

  return (
    <div className="animate-fade-in">
      <Card className="p-7 text-center animate-slide-up">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
          isWarning ? 'bg-status-warning/10' : 'bg-status-error/10'
        }`}>
          {isWarning ? (
            <AlertTriangle className="w-7 h-7 text-status-warning" />
          ) : (
            <XCircle className="w-7 h-7 text-status-error" />
          )}
        </div>

        {/* Focused when this screen appears (SigningFlow), so the title and both lines are read out */}
        <StageHeading
          aria-describedby={`${id}-message ${id}-next`}
          className="text-lg font-semibold text-warm-black mb-2"
        >
          {failure.title}
        </StageHeading>

        <p id={`${id}-message`} className="text-sm text-warm-gray max-w-sm mx-auto">{failure.message}</p>
        <p id={`${id}-next`} className="text-sm text-warm-black max-w-sm mx-auto mt-2">{failure.next}</p>

        {failure.code && (
          <p className="text-[11px] text-warm-gray-light font-mono mt-4">Error code: {failure.code}</p>
        )}
      </Card>

      <div className="flex flex-col gap-3 mt-4">
        {onRetry && (
          <Button onClick={onRetry} className="px-4 transition-colors">
            <RotateCcw className="w-4 h-4" />
            {failure.retryLabel ?? 'Try Again'}
          </Button>
        )}
        <DashboardLink
          href={dashboardUrl}
          endSession
          variant={onRetry ? 'secondary' : 'primary'}
          className="px-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </DashboardLink>
      </div>
    </div>
  );
}

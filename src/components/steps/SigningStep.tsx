import { Lock, ShieldCheck } from 'lucide-react';
import { StageHeading } from '../ui';

/**
 * Shown while Key 1 signs and the transaction is submitted. `status` names the current step.
 * SigningFlow puts it in StepFrame's card.
 */
export default function SigningStep({ status }: { status: string }) {
  return (
    <>
      <div className="signing-spinner mx-auto mb-6">
        <svg className="signing-ring" viewBox="0 0 64 64">
          <circle
            cx="32" cy="32" r="28"
            stroke="#F3F0EB" strokeWidth="2.5" fill="none"
          />
          <circle
            className="signing-ring-arc"
            cx="32" cy="32" r="28"
            stroke="#1A1817" strokeWidth="2.5" fill="none"
            strokeLinecap="round"
          />
        </svg>
        <div className="signing-icon">
          <ShieldCheck className="w-6 h-6 text-warm-black" />
        </div>
      </div>
      <StageHeading className="text-base font-semibold text-warm-black mb-1.5">
        Signing Transaction
      </StageHeading>
      <p role="status" className="text-sm text-warm-gray mb-0.5">{status}</p>
      <p className="text-xs text-warm-gray-light">This takes a few seconds. Keep this page open.</p>
      <p className="text-[11px] text-warm-gray-light mt-4 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        Key 1 never leaves this browser
      </p>
    </>
  );
}

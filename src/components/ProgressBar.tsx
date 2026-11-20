import type { Stage } from '../lib/signing-flow';

/** The two-step bar above the review and Key 1 steps: green once a step is done. */
export default function ProgressBar({ stage }: { stage: Stage }) {
  const step =
    stage === 'review' ? 1
    : stage === 'enter-key' ? 2
    : stage === 'signing' ? 2
    : stage === 'confirming' ? 2
    : stage === 'success' ? 3
    : 0;

  if (step === 0) return null;

  return (
    <div className="flex gap-1.5 mb-7">
      <div className={`flex-1 h-[3px] rounded-full transition-colors duration-500 ${
        step > 1 ? 'bg-status-success' : 'bg-warm-black'
      }`} />
      <div className={`flex-1 h-[3px] rounded-full transition-colors duration-500 ${
        step >= 3 ? 'bg-status-success' : step >= 2 ? 'bg-warm-black' : 'bg-cream-dark'
      }`} />
    </div>
  );
}

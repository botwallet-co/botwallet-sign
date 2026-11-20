import type { ReactNode } from 'react';
import { Card } from '../ui';

/**
 * The card the review, Key 1 and signing steps are shown in. SigningFlow renders it in the
 * same place for all three, so going from one step to the next changes only what is in it:
 * the card's entrance animation plays when it first appears, not again on every step.
 */
export default function StepFrame({ signing = false, below, children }: {
  /** The signing step: a centred spinner with more room around it. */
  signing?: boolean;
  /** Shown under the card. */
  below?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={signing ? 'pt-8 animate-fade-in' : 'animate-fade-in'}>
      <Card className={signing ? 'py-14 px-7 text-center' : 'p-5 sm:p-7 animate-slide-up'}>
        {children}
      </Card>
      {below}
    </div>
  );
}

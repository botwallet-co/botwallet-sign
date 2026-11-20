import { Clock } from 'lucide-react';
import type { ActionKind } from '../../lib/action';
import { MINUTE } from '../../lib/deadline';

/** How long the link still works. `deadline` is null when this device's clock can't be trusted for it. */
export default function ExpiryNote({ deadline, now, kind }: { deadline: number | null; now: number; kind: ActionKind }) {
  let text = 'This page works for 15 minutes.';
  if (deadline !== null) {
    const minutes = Math.ceil((deadline - now) / MINUTE);
    text = minutes > 0
      ? `This link expires in ${minutes} min.`
      : `This link has expired. Start a new ${kind} from your dashboard.`;
  }

  return (
    <p className="flex items-center justify-center gap-1.5">
      <Clock className="w-3 h-3 shrink-0" />
      {text}
    </p>
  );
}

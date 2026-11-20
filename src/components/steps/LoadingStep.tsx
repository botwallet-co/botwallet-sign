import { Loader2 } from 'lucide-react';

export default function LoadingStep() {
  return (
    <div className="text-center py-20 animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-cream-dark/60 flex items-center justify-center mx-auto mb-4">
        <Loader2 className="w-5 h-5 animate-spin text-warm-gray" />
      </div>
      <p role="status" className="text-sm text-warm-gray">Loading transaction…</p>
    </div>
  );
}

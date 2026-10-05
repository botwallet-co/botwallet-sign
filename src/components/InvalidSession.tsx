import { AlertTriangle } from 'lucide-react';
import { DEFAULT_RETURN_URL } from '../lib/fragment';

export default function InvalidSession() {
  return (
    <div className="animate-fade-in pt-8">
      <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-status-warning/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-status-warning" />
        </div>
        <h1 className="text-lg font-semibold text-warm-black mb-2">Invalid Signing Session</h1>
        <p className="text-sm text-warm-gray max-w-sm mx-auto">
          This link is invalid, expired, or has already been used.
        </p>
        <p className="text-sm text-warm-black max-w-sm mx-auto mt-2 mb-6">
          If you just signed, check your wallet in the dashboard to see the result. Otherwise,
          start a new withdrawal from your dashboard.
        </p>
        <a
          href={DEFAULT_RETURN_URL}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] bg-warm-black text-white text-sm font-semibold hover:bg-warm-black/90 transition-colors"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

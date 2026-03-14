import { useState } from 'react';
import { parseFragment, type SigningRequest } from './lib/fragment';
import SigningFlow from './components/SigningFlow';
import InvalidSession from './components/InvalidSession';
import { ArrowLeft } from 'lucide-react';

const initialRequest = parseFragment();

export default function App() {
  const [request] = useState<SigningRequest | null>(initialRequest);
  const [network, setNetwork] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <nav className="h-14 bg-black flex justify-between items-center px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <a
            href={request?.returnUrl || 'https://app.botwallet.co'}
            className="text-white/40 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </a>
          <div className="flex items-baseline gap-1.5">
            <span className="font-black text-xs tracking-[0.15em] text-white">
              BOTWALLET
            </span>
            <span className="font-normal text-[11px] tracking-[0.1em] text-white/45 uppercase border-l border-white/15 pl-1.5">
              Signer
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {network && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
              network === 'mainnet-beta'
                ? 'bg-green-900/40 text-green-400'
                : 'bg-purple-900/40 text-purple-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                network === 'mainnet-beta' ? 'bg-green-400' : 'bg-purple-400'
              }`} />
              {network === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}
            </span>
          )}
          <span className="text-[11px] font-medium tracking-[0.05em] text-white/35">
            Secure Signing
          </span>
        </div>
      </nav>

      <main className="flex-1 max-w-[480px] mx-auto w-full px-5 py-6">
        {request ? (
          <SigningFlow
            intentId={request.intentId}
            token={request.token}
            returnUrl={request.returnUrl}
            onNetwork={setNetwork}
          />
        ) : (
          <InvalidSession />
        )}
      </main>

      <footer className="border-t border-cream-dark">
        <div className="max-w-[480px] mx-auto px-5 py-4 text-center">
          <p className="text-[11px] text-warm-gray-light">
            Your key never leaves this browser ·{' '}
            <a
              href="https://github.com/botwallet-co/botwallet-sign"
              target="_blank"
              rel="noopener noreferrer"
              className="text-warm-gray hover:text-warm-black transition-colors"
            >
              Open source
            </a>
            {' '}· Verifiable
          </p>
        </div>
      </footer>
    </div>
  );
}

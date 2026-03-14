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
      <nav style={{
        height: '56px',
        background: '#000',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href={request?.returnUrl || 'https://app.botwallet.co'}
            style={{
              color: 'rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            <ArrowLeft size={16} />
          </a>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span style={{
              fontWeight: 900,
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              color: '#fff',
            }}>
              BOTWALLET
            </span>
            <span style={{
              fontWeight: 400,
              fontSize: '0.6875rem',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              borderLeft: '1px solid rgba(255,255,255,0.15)',
              paddingLeft: '0.4rem',
              marginLeft: '0.05rem',
            }}>
              Signer
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.35)',
          }}>
            Secure Signing
          </span>
        </div>
      </nav>

      <main className="flex-1 max-w-md mx-auto w-full px-4 sm:px-5 py-5 sm:py-6">
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
        <div className="max-w-md mx-auto px-5 py-4 text-center">
          <p className="text-[11px] text-warm-gray-light">
            Keys are processed locally and never sent to any server.
          </p>
          <a
            href="https://github.com/botwallet-co/botwallet-sign"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-warm-gray hover:text-warm-black transition-colors mt-0.5 inline-block"
          >
            Open source — Verify this code
          </a>
        </div>
      </footer>
    </div>
  );
}

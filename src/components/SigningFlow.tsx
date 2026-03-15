import { useState, useEffect, useCallback, useRef } from 'react';
import { getSigningIntent, signingFrostInit, signingFrostComplete, ApiError } from '../lib/api';
import type { SigningIntentDetails, FrostInitResult, FrostCompleteResult } from '../lib/api';
import { generateNonce, computePartialSig, zeroMemory } from '../lib/frost';
import { mnemonicToScalar, derivePublicShareFromScalar, toBase64, fromBase64 } from '../lib/mnemonic';
import TransactionCard from './TransactionCard';
import MnemonicInput from './MnemonicInput';
import SuccessView from './SuccessView';
import ErrorView from './ErrorView';
import { Loader2, ShieldCheck, Lock, ChevronRight, ArrowLeft } from 'lucide-react';

type Stage = 'loading' | 'review' | 'enter-key' | 'signing' | 'success' | 'error';

interface Props {
  intentId: string;
  token: string;
  returnUrl?: string;
  onNetwork?: (network: string) => void;
}

function ProgressBar({ stage }: { stage: Stage }) {
  const step =
    stage === 'review' ? 1
    : stage === 'enter-key' ? 2
    : stage === 'signing' ? 2
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

export default function SigningFlow({ intentId, token, returnUrl, onNetwork }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [details, setDetails] = useState<SigningIntentDetails | null>(null);
  const [result, setResult] = useState<FrostCompleteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [signingStatus, setSigningStatus] = useState('');
  const [mnemonicReady, setMnemonicReady] = useState(false);
  const validMnemonicRef = useRef<string | null>(null);
  const signingInProgress = useRef(false);

  // Scroll to top on stage transitions for a clean feel
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stage]);

  useEffect(() => {
    loadIntent();
  }, [intentId, token]);

  async function loadIntent() {
    try {
      const data = await getSigningIntent(intentId, token);
      setDetails(data);
      onNetwork?.(data.network);
      setStage('review');
    } catch (e) {
      if (e instanceof ApiError) {
        setErrorCode(e.code);
        setErrorMessage(e.message);
      } else {
        setErrorMessage('Failed to load transaction details. Please return to the dashboard and try again.');
      }
      setStage('error');
    }
  }

  const handleMnemonicValid = useCallback((mnemonic: string) => {
    validMnemonicRef.current = mnemonic;
    setMnemonicReady(true);
  }, []);

  const handleMnemonicReset = useCallback(() => {
    validMnemonicRef.current = null;
    setMnemonicReady(false);
  }, []);

  function goToEnterKey() {
    setStage('enter-key');
  }

  function goBackToReview() {
    handleMnemonicReset();
    setStage('review');
  }

  async function handleSign() {
    if (signingInProgress.current) return;
    signingInProgress.current = true;

    const mnemonic = validMnemonicRef.current;
    if (!mnemonic || !details) {
      signingInProgress.current = false;
      return;
    }

    setStage('signing');
    let s1Scalar: Uint8Array | null = null;
    let nonceSecret: Uint8Array | null = null;
    let partialSig: Uint8Array | null = null;

    try {
      setSigningStatus('Deriving key from recovery phrase…');
      s1Scalar = mnemonicToScalar(mnemonic);
      const s1PublicShare = derivePublicShareFromScalar(s1Scalar);
      const s1PublicShareB64 = toBase64(s1PublicShare);

      setSigningStatus('Generating cryptographic nonce…');
      const nonce = generateNonce();
      nonceSecret = nonce.secret;
      const nonceCommitmentB64 = toBase64(nonce.commitment);

      setSigningStatus('Initiating FROST signing protocol…');
      let initResult: FrostInitResult;
      try {
        initResult = await signingFrostInit(intentId, token, nonceCommitmentB64, s1PublicShareB64);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'KEY_MISMATCH') {
          setErrorMessage(e.message);
          setErrorCode(e.code);
          setStage('error');
          return;
        }
        throw e;
      }

      setSigningStatus('Computing partial signature…');
      const serverNonceCommitment = fromBase64(initResult.server_nonce_commitment);
      const groupKey = fromBase64(initResult.group_key);
      const message = fromBase64(initResult.message_to_sign);

      partialSig = computePartialSig(
        nonceSecret,
        nonce.commitment,
        serverNonceCommitment,
        groupKey,
        message,
        s1Scalar,
      );

      zeroMemory(s1Scalar);
      zeroMemory(nonceSecret);
      s1Scalar = null;
      nonceSecret = null;

      setSigningStatus('Submitting signature to network…');
      const completeResult = await signingFrostComplete(
        intentId,
        token,
        initResult.session_id,
        toBase64(partialSig),
      );

      zeroMemory(partialSig);
      partialSig = null;

      setResult(completeResult);
      setStage('success');

    } catch (e) {
      if (e instanceof ApiError) {
        setErrorCode(e.code);
        setErrorMessage(e.message);
      } else {
        setErrorMessage('An unexpected error occurred during signing. Your funds are safe — nothing was sent.');
      }
      setStage('error');
    } finally {
      if (s1Scalar) zeroMemory(s1Scalar);
      if (nonceSecret) zeroMemory(nonceSecret);
      if (partialSig) zeroMemory(partialSig);
      validMnemonicRef.current = null;
      signingInProgress.current = false;
    }
  }

  // ── Loading ──
  if (stage === 'loading') {
    return (
      <div className="text-center py-20 animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-cream-dark/60 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-warm-gray" />
        </div>
        <p className="text-sm text-warm-gray">Loading transaction…</p>
      </div>
    );
  }

  // ── Error ──
  if (stage === 'error') {
    return (
      <ErrorView
        message={errorMessage}
        code={errorCode}
        returnUrl={returnUrl}
        onRetry={errorCode === 'KEY_MISMATCH' ? () => {
          setStage('enter-key');
          setMnemonicReady(false);
          validMnemonicRef.current = null;
          setErrorMessage('');
          setErrorCode('');
        } : undefined}
      />
    );
  }

  // ── Success ──
  if (stage === 'success' && result && details) {
    return (
      <>
        <ProgressBar stage={stage} />
        <SuccessView result={result} details={details} returnUrl={returnUrl} />
      </>
    );
  }

  // ── Signing ──
  if (stage === 'signing') {
    return (
      <>
        <ProgressBar stage={stage} />
        <div className="pt-8 animate-fade-in">
          <div className="bg-white rounded-[20px] border border-cream-dark py-14 px-7 shadow-sm text-center">
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
            <h2 className="text-base font-semibold text-warm-black mb-1.5">Signing Transaction</h2>
            <p className="text-sm text-warm-gray mb-0.5">{signingStatus}</p>
            <p className="text-[11px] text-warm-gray-light mt-4 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" />
              Keys never leave your browser
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── Step 1: Review ──
  if (stage === 'review' && details) {
    const isTransfer = details.action_type === 'transfer';
    return (
      <>
        <ProgressBar stage={stage} />
        <div className="animate-fade-in">
          <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm animate-slide-up">
            <p className="text-xs text-warm-gray-light uppercase tracking-[0.12em] mb-1">
              Step 1 of 2
            </p>
            <h1 className="text-xl font-semibold text-warm-black mb-5">
              Review {isTransfer ? 'Transfer' : 'Withdrawal'}
            </h1>

            <TransactionCard details={details} />

            <button
              onClick={goToEnterKey}
              className="w-full mt-6 py-3.5 rounded-[14px] font-semibold text-sm
                bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]
                transition-all flex items-center justify-center gap-2"
            >
              Continue to Sign
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Step 2: Enter Key ──
  if (stage === 'enter-key' && details) {
    const totalUsdc = (parseFloat(details.amount) + parseFloat(details.fee_usdc)).toFixed(2);
    const isTransfer = details.action_type === 'transfer';

    return (
      <>
        <ProgressBar stage={stage} />
        <div className="animate-fade-in">
          <div className="bg-white rounded-[20px] border border-cream-dark p-7 shadow-sm animate-slide-up">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-warm-gray-light uppercase tracking-[0.12em]">
                Step 2 of 2
              </p>
              <button
                onClick={goBackToReview}
                className="text-xs text-warm-gray-light hover:text-warm-black transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            </div>
            <h1 className="text-xl font-semibold text-warm-black mb-1.5">
              Sign with Your Key
            </h1>
            <p className="text-sm text-warm-gray mb-5 leading-relaxed">
              Enter your 12-word recovery phrase to authorize this{' '}
              <span className="font-mono font-medium text-warm-black">${totalUsdc}</span>{' '}
              USDC {isTransfer ? 'transfer' : 'withdrawal'}.
              Your key never leaves your browser.
            </p>

            <div className="inline-flex items-center gap-1.5 bg-cream rounded-full px-3.5 py-1.5 mb-5 text-[13px] text-warm-black font-medium">
              <Lock className="w-3 h-3 text-warm-gray" />
              ${totalUsdc} USDC total
            </div>

            <MnemonicInput
              onValid={handleMnemonicValid}
              onReset={handleMnemonicReset}
              disabled={false}
            />

            <button
              onClick={handleSign}
              disabled={!mnemonicReady}
              className="w-full mt-5 py-3.5 rounded-[14px] font-semibold text-sm transition-all
                bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]
                flex items-center justify-center gap-2
                disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:hover:bg-warm-black"
            >
              <ShieldCheck className="w-4 h-4" />
              Sign & Submit
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-warm-gray-light">
            <Lock className="w-3 h-3" />
            <span>Processed locally · Never sent to any server</span>
          </div>
        </div>
      </>
    );
  }

  return null;
}

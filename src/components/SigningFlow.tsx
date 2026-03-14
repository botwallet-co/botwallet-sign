import { useState, useEffect, useCallback, useRef } from 'react';
import { getSigningIntent, signingFrostInit, signingFrostComplete, ApiError } from '../lib/api';
import type { SigningIntentDetails, FrostInitResult, FrostCompleteResult } from '../lib/api';
import { generateNonce, computePartialSig, zeroMemory } from '../lib/frost';
import { mnemonicToScalar, mnemonicToPublicShare, toBase64, fromBase64 } from '../lib/mnemonic';
import TransactionCard from './TransactionCard';
import MnemonicInput from './MnemonicInput';
import SuccessView from './SuccessView';
import ErrorView from './ErrorView';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';

type Stage = 'loading' | 'review' | 'signing' | 'success' | 'error';

interface Props {
  intentId: string;
  token: string;
  returnUrl?: string;
  onNetwork?: (network: string) => void;
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

  async function handleSign() {
    const mnemonic = validMnemonicRef.current;
    if (!mnemonic || !details) return;

    setStage('signing');
    let s1Scalar: Uint8Array | null = null;
    let nonceSecret: Uint8Array | null = null;
    let partialSig: Uint8Array | null = null;

    try {
      setSigningStatus('Deriving key from recovery phrase...');
      s1Scalar = mnemonicToScalar(mnemonic);
      const s1PublicShare = mnemonicToPublicShare(mnemonic);
      const s1PublicShareB64 = toBase64(s1PublicShare);

      setSigningStatus('Generating cryptographic nonce...');
      const nonce = generateNonce();
      nonceSecret = nonce.secret;
      const nonceCommitmentB64 = toBase64(nonce.commitment);

      setSigningStatus('Initiating FROST signing protocol...');
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

      setSigningStatus('Computing partial signature...');
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

      setSigningStatus('Submitting signature to network...');
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
    }
  }

  if (stage === 'loading') {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-warm-gray" />
        <p className="text-sm text-warm-gray mt-3">Loading transaction...</p>
      </div>
    );
  }

  if (stage === 'success' && result && details) {
    return <SuccessView result={result} details={details} returnUrl={returnUrl} />;
  }

  if (stage === 'error') {
    return (
      <ErrorView
        message={errorMessage}
        code={errorCode}
        returnUrl={returnUrl}
        onRetry={errorCode === 'KEY_MISMATCH' ? () => {
          setStage('review');
          setMnemonicReady(false);
          setErrorMessage('');
          setErrorCode('');
        } : undefined}
      />
    );
  }

  if (stage === 'signing') {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-warm-black/5 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-warm-black" />
        </div>
        <h2 className="text-base font-semibold text-warm-black mb-1">Signing Transaction</h2>
        <p className="text-sm text-warm-gray">{signingStatus}</p>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-warm-gray-light">
          <Lock className="w-3 h-3" />
          <span>Keys are processed in your browser only</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {details && <TransactionCard details={details} />}
      <MnemonicInput onValid={handleMnemonicValid} disabled={stage !== 'review'} />

      <button
        onClick={handleSign}
        disabled={!mnemonicReady}
        className="w-full py-3 rounded-card-lg font-semibold text-sm transition-all
          bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]
          disabled:bg-cream-dark disabled:text-warm-gray-light disabled:cursor-not-allowed
          flex items-center justify-center gap-2"
      >
        <ShieldCheck className="w-4 h-4" />
        Sign & Submit
      </button>

      <p className="text-center text-[11px] text-warm-gray-light">
        Your recovery phrase is processed entirely in your browser and never sent to any server.
      </p>
    </div>
  );
}

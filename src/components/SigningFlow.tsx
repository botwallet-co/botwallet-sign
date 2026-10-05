import { useState, useEffect, useCallback, useRef } from 'react';
import { getSigningIntent, signingFrostInit, signingFrostComplete } from '../lib/api';
import type { SigningIntentDetails } from '../lib/api';
import { generateNonce, computePartialSig, zeroMemory } from '../lib/frost';
import { mnemonicToScalar, derivePublicShareFromScalar, toBase64, fromBase64 } from '../lib/mnemonic';
import {
  afterConfirming, describeFailure, mayHaveGoneThrough, type ActionKind, type Failure, type SignPhase,
} from '../lib/errors';
import { confirmationOf, sentUnconfirmed, type Confirmation, type SentUnconfirmed } from '../lib/confirming';
import {
  verifyIntentMatchesRequest, verifyTransaction, TransactionMismatchError, type ExpectedTransfer,
} from '../lib/verify-transaction';
import {
  clearStoredSession, markSubmitting, clearSubmitting, wasSubmitting, DEFAULT_RETURN_URL,
} from '../lib/fragment';
import { summarizeFees } from '../lib/format';
import { earlierAttempt } from '../lib/earlier-attempt';
import TransactionCard from './TransactionCard';
import MnemonicInput from './MnemonicInput';
import SuccessView, { type Receipt } from './SuccessView';
import ConfirmingView from './ConfirmingView';
import ErrorView from './ErrorView';
import {
  Loader2, ShieldCheck, Lock, ChevronRight, ArrowLeft, Clock, HelpCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

// 'confirming': sent to Solana, waiting for the network to confirm it (ConfirmingView)
type Stage = 'loading' | 'review' | 'enter-key' | 'signing' | 'confirming' | 'success' | 'error';

interface Props {
  intentId: string;
  token: string;
  returnUrl?: string;
  expected?: ExpectedTransfer;
  onNetwork?: (network: string) => void;
  onSigned?: () => void;
}

const MINUTE = 60_000;

function kindOf(actionType: string | undefined): ActionKind {
  return actionType === 'transfer' ? 'transfer' : 'withdrawal';
}

// Signing links last 15 minutes. If this device's clock disagrees with the server's
// expiry, show the general limit rather than a wrong countdown.
function trustedDeadline(expiresAt: string | undefined): number | null {
  const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
  const left = deadline - Date.now();
  return left > 0 && left <= 16 * MINUTE ? deadline : null;
}

function ProgressBar({ stage }: { stage: Stage }) {
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

// The current time, updated every 15 seconds and right at the deadline, while there is one.
function useNow(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    const atDeadline = setTimeout(tick, Math.max(0, deadline - Date.now()) + 100);
    return () => {
      clearInterval(timer);
      clearTimeout(atDeadline);
    };
  }, [deadline]);

  return now;
}

function ExpiryNote({ deadline, now, kind }: { deadline: number | null; now: number; kind: ActionKind }) {
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

// Counts down to when the server frees a link whose earlier signing round is still open.
function RetryNotice({ until, kind, onReady }: { until: number; kind: ActionKind; onReady: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.ceil((until - now) / 1000);
  const ready = seconds <= 0;
  useEffect(() => {
    if (ready) onReady();
  }, [ready]);

  return (
    <div className="mt-5 flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-900 leading-relaxed">
      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <p>
        Signing this {kind} started a moment ago, maybe in another tab. Nothing has been sent.
        You can continue in {Math.max(seconds, 1)} s.
      </p>
    </div>
  );
}

function KeyHelp({ dashboardUrl }: { dashboardUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-warm-gray hover:text-warm-black transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Where do I find Key 1?
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-cream rounded-lg text-xs text-warm-gray leading-relaxed space-y-1.5 animate-fade-in">
          <p>
            Your agent has it. In the{' '}
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-warm-black underline underline-offset-2"
            >
              Botwallet dashboard
            </a>
            , open the wallet, then ⋮ → Backup Keys, to get a message you can send your agent.
          </p>
          <p>If you saved your backup, Key 1 is its first 12 words. Never enter Key 2 on this page.</p>
        </div>
      )}
    </div>
  );
}

function CancelLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      onClick={clearStoredSession}
      className="w-full mt-3 py-3.5 rounded-[14px] font-semibold text-sm
        border border-cream-dark text-warm-black hover:bg-cream transition-colors
        flex items-center justify-center"
    >
      Cancel
    </a>
  );
}

export default function SigningFlow({ intentId, token, returnUrl, expected, onNetwork, onSigned }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [details, setDetails] = useState<SigningIntentDetails | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  // An earlier attempt started moments ago: Continue waits until the server frees the link.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [result, setResult] = useState<Receipt | null>(null);
  // Sent to Solana and not confirmed when Botwallet replied
  const [sent, setSent] = useState<SentUnconfirmed | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [signingStatus, setSigningStatus] = useState('');
  const [mnemonicReady, setMnemonicReady] = useState(false);
  const validMnemonicRef = useRef<string | null>(null);
  const signingInProgress = useRef(false);

  const kind = kindOf(details?.action_type);
  const dashboardUrl = returnUrl || DEFAULT_RETURN_URL;
  const now = useNow(deadline);
  const expired = deadline !== null && now >= deadline;
  const awaitingOwner = stage === 'review' || stage === 'enter-key';

  // On a new screen, scroll to the top and move focus to its heading, so screen readers say
  // where the owner is now. Not when something on the new screen already took focus, like
  // the first Key 1 box.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (stage === 'loading') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    document.querySelector<HTMLElement>('main [data-stage-heading]')?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    loadIntent();
  }, [intentId, token]);

  // Leaving while signing would hide whether the money was sent. Browsers ask first when the
  // tab is closed, reloaded or sent back; iOS Safari doesn't, so loadIntent also checks for
  // an unfinished attempt after a reload.
  useEffect(() => {
    if (stage !== 'signing') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage]);

  useEffect(() => {
    if (details) document.title = `Botwallet — Confirm ${kind}`;
  }, [details, kind]);

  // The link's time is up by this device's clock, so the buttons are off. Ask the server,
  // which decides: if it still accepts the link, this clock runs ahead, so stop counting
  // down and let the owner go on.
  useEffect(() => {
    if (!expired || !awaitingOwner) return;
    let cancelled = false;
    getSigningIntent(intentId, token).then(
      () => {
        if (!cancelled) setDeadline(null);
      },
      e => {
        if (cancelled) return;
        handleMnemonicReset();
        fail(e, 'load');
      },
    );
    return () => { cancelled = true; };
  }, [expired, awaitingOwner]);

  function fail(error: unknown, phase: SignPhase, failedKind: ActionKind = kind) {
    if (error instanceof TransactionMismatchError) console.warn('Refused to sign:', error.message);
    const next = describeFailure(error, phase, failedKind);
    if (next.endSession) clearStoredSession();
    setFailure(next);
    setStage('error');
  }

  async function loadIntent() {
    try {
      const data = await getSigningIntent(intentId, token);
      try {
        verifyIntentMatchesRequest(data, expected);
      } catch (e) {
        fail(e, 'load', kindOf(data.action_type));
        return;
      }
      setDetails(data);
      setDeadline(trustedDeadline(data.expires_at));
      onNetwork?.(data.network);

      const attempt = earlierAttempt(data, wasSubmitting(intentId));
      if (attempt.kind === 'may-have-sent') {
        setFailure(mayHaveGoneThrough(kindOf(data.action_type)));
        setStage('error');
        return;
      }
      clearSubmitting();
      setRetryAt(attempt.kind === 'wait' ? attempt.until : null);
      setStage('review');
    } catch (e) {
      fail(e, 'load');
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

  function retry() {
    const target = failure?.retry;
    setFailure(null);
    if (target === 'load') {
      setStage('loading');
      loadIntent();
    } else {
      // Same intent and token: signing_frost_init accepts the link again while it is
      // 'pending', which includes a signing round the server released after it timed out.
      handleMnemonicReset();
      setStage('enter-key');
    }
  }

  async function handleSign() {
    if (signingInProgress.current) return;

    const mnemonic = validMnemonicRef.current;
    if (!mnemonic || !details) return;
    signingInProgress.current = true;

    setStage('signing');
    let phase: SignPhase = 'prepare';
    let s1Scalar: Uint8Array | null = null;
    let nonceSecret: Uint8Array | null = null;
    let partialSig: Uint8Array | null = null;

    try {
      setSigningStatus('Checking Key 1…');
      s1Scalar = mnemonicToScalar(mnemonic);
      const s1PublicShare = derivePublicShareFromScalar(s1Scalar);
      const s1PublicShareB64 = toBase64(s1PublicShare);

      setSigningStatus('Preparing the signature…');
      const nonce = generateNonce();
      nonceSecret = nonce.secret;
      const nonceCommitmentB64 = toBase64(nonce.commitment);

      setSigningStatus('Starting secure signing…');
      phase = 'init';
      const initResult = await signingFrostInit(intentId, token, nonceCommitmentB64, s1PublicShareB64);

      setSigningStatus('Signing in this browser…');
      phase = 'sign';
      const serverNonceCommitment = fromBase64(initResult.server_nonce_commitment);
      const groupKey = fromBase64(initResult.group_key);
      const message = fromBase64(initResult.message_to_sign);
      // Key 1 only signs the transfer the owner reviewed.
      verifyTransaction(details, groupKey, message);

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

      setSigningStatus('Sending to the Solana network…');
      phase = 'complete';
      markSubmitting(intentId);
      const completeResult = await signingFrostComplete(
        intentId,
        token,
        initResult.session_id,
        toBase64(partialSig),
      );

      zeroMemory(partialSig);
      partialSig = null;

      clearStoredSession();
      setResult(completeResult);
      setStage('success');
      onSigned?.();

    } catch (e) {
      // The reply (or its absence) is explained on the next screen from here.
      if (phase === 'complete') clearSubmitting();
      const sentNotConfirmed = phase === 'complete' ? sentUnconfirmed(e) : null;
      if (sentNotConfirmed) {
        // Not a failure: it may still go through, so wait here for Solana's answer
        setSent(sentNotConfirmed);
        setStage('confirming');
      } else {
        fail(e, phase);
      }
    } finally {
      if (s1Scalar) zeroMemory(s1Scalar);
      if (nonceSecret) zeroMemory(nonceSecret);
      if (partialSig) zeroMemory(partialSig);
      validMnemonicRef.current = null;
      signingInProgress.current = false;
    }
  }

  // How a transfer that was sent and is confirming stands now (confirming.ts)
  async function checkConfirmation(): Promise<Confirmation> {
    try {
      await getSigningIntent(intentId, token);
      return confirmationOf(undefined);
    } catch (e) {
      return confirmationOf(e);
    }
  }

  function settleConfirming(outcome: Exclude<Confirmation, 'confirming'>) {
    clearStoredSession();
    if (outcome === 'completed' && details) {
      setResult({ solana_signature: sent?.signature ?? '', amount_usdc: details.amount, fee_usdc: details.fee_usdc });
      setStage('success');
      onSigned?.();
      return;
    }
    setFailure(afterConfirming(outcome === 'failed' ? 'failed' : 'unknown', kind));
    setStage('error');
  }

  // ── Loading ──
  if (stage === 'loading') {
    return (
      <div className="text-center py-20 animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-cream-dark/60 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-warm-gray" />
        </div>
        <p role="status" className="text-sm text-warm-gray">Loading transaction…</p>
      </div>
    );
  }

  // ── Error ──
  if (stage === 'error' && failure) {
    return (
      <ErrorView
        failure={failure}
        returnUrl={returnUrl}
        onRetry={failure.retry ? retry : undefined}
      />
    );
  }

  // ── Sent, confirming ──
  if (stage === 'confirming' && details) {
    return (
      <>
        <ProgressBar stage={stage} />
        <ConfirmingView
          kind={kind}
          amount={details.amount}
          signature={sent?.signature ?? null}
          network={details.network}
          returnUrl={returnUrl}
          check={checkConfirmation}
          onSettled={settleConfirming}
        />
      </>
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
            <h1 tabIndex={-1} data-stage-heading className="text-base font-semibold text-warm-black mb-1.5 outline-none">
              Signing Transaction
            </h1>
            <p role="status" className="text-sm text-warm-gray mb-0.5">{signingStatus}</p>
            <p className="text-xs text-warm-gray-light">This takes a few seconds. Keep this page open.</p>
            <p className="text-[11px] text-warm-gray-light mt-4 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" />
              Key 1 never leaves this browser
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
          <div className="bg-white rounded-[20px] border border-cream-dark p-5 sm:p-7 shadow-sm animate-slide-up">
            <p className="text-xs text-warm-gray-light uppercase tracking-[0.12em] mb-1">
              Step 1 of 2
            </p>
            <h1 tabIndex={-1} data-stage-heading className="text-xl font-semibold text-warm-black mb-5 outline-none">
              Review {isTransfer ? 'Transfer' : 'Withdrawal'}
            </h1>

            <TransactionCard details={details} />

            {retryAt !== null && (
              <RetryNotice until={retryAt} kind={kind} onReady={() => setRetryAt(null)} />
            )}

            <button
              onClick={goToEnterKey}
              disabled={expired || retryAt !== null}
              className="w-full mt-6 py-3.5 rounded-[14px] font-semibold text-sm
                bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]
                transition-all flex items-center justify-center gap-2
                disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:hover:bg-warm-black"
            >
              Continue to Sign
              <ChevronRight className="w-4 h-4" />
            </button>

            <CancelLink href={dashboardUrl} />

            <div className="mt-4 text-[11px] text-warm-gray-light">
              <ExpiryNote deadline={deadline} now={now} kind={kind} />
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Step 2: Enter Key ──
  if (stage === 'enter-key' && details) {
    const totalUsdc = summarizeFees(details).total ?? '—';

    return (
      <>
        <ProgressBar stage={stage} />
        <div className="animate-fade-in">
          <div className="bg-white rounded-[20px] border border-cream-dark p-5 sm:p-7 shadow-sm animate-slide-up">
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
            <h1 tabIndex={-1} data-stage-heading className="text-xl font-semibold text-warm-black mb-1.5 outline-none">
              Confirm with Key 1
            </h1>
            <p className="text-sm text-warm-gray mb-3 leading-relaxed">
              Enter Key 1, the 12 words your agent keeps, to authorize this {kind}{' '}
              (<span className="font-mono font-medium text-warm-black">${totalUsdc}</span> USDC in total).
              The words are checked in this browser and never sent anywhere.
            </p>

            <KeyHelp dashboardUrl={dashboardUrl} />

            <div className="inline-flex items-center gap-1.5 bg-cream rounded-full px-3.5 py-1.5 mb-5 text-[13px] text-warm-black font-medium">
              <Lock className="w-3 h-3 text-warm-gray" />
              ${totalUsdc} USDC total
            </div>

            <p className="flex items-center gap-1.5 text-xs text-warm-gray mb-3">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              Only enter these words on sign.botwallet.co.
            </p>

            <MnemonicInput
              onValid={handleMnemonicValid}
              onReset={handleMnemonicReset}
              disabled={expired}
            />

            <button
              onClick={handleSign}
              disabled={!mnemonicReady || expired}
              className="w-full mt-5 py-3.5 rounded-[14px] font-semibold text-sm transition-all
                bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]
                flex items-center justify-center gap-2
                disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:hover:bg-warm-black"
            >
              <ShieldCheck className="w-4 h-4" />
              Sign & Submit
            </button>

            <CancelLink href={dashboardUrl} />

            <div className="mt-4 text-center text-[11px] text-warm-gray-light">
              <ExpiryNote deadline={deadline} now={now} kind={kind} />
            </div>
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

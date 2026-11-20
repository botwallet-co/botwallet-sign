import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { getSigningIntent, type SigningIntentDetails } from '../lib/api';
import { kindOf, type ActionKind } from '../lib/action';
import { afterConfirming, describeFailure, mayHaveGoneThrough, type SignPhase } from '../lib/errors';
import { confirmationOf, sentUnconfirmed, type Confirmation } from '../lib/confirming';
import { verifyIntentMatchesRequest, TransactionMismatchError, type ExpectedTransfer } from '../lib/verify-transaction';
import { clearStoredSession, clearSubmitting, wasSubmitting } from '../lib/tab-session';
import { earlierAttempt } from '../lib/earlier-attempt';
import { trustedDeadline } from '../lib/deadline';
import { flowReducer, INITIAL_FLOW } from '../lib/signing-flow';
import { signWithKey1 } from '../lib/sign';
import { confirmedReceipt, toReceipt } from '../lib/receipt';
import { useNow } from '../hooks/useNow';
import { useLatest } from '../hooks/useLatest';
import ProgressBar from './ProgressBar';
import LoadingStep from './steps/LoadingStep';
import StepFrame from './steps/StepFrame';
import ReviewStep from './steps/ReviewStep';
import KeyStep, { KeyStepNote } from './steps/KeyStep';
import SigningStep from './steps/SigningStep';
import ConfirmingView from './ConfirmingView';
import SuccessView from './SuccessView';
import ErrorView from './ErrorView';

interface Props {
  intentId: string;
  token: string;
  /** Where Cancel and Return to Dashboard go. */
  dashboardUrl: string;
  expected?: ExpectedTransfer;
  onNetwork?: (network: string) => void;
  onSigned?: () => void;
}

export default function SigningFlow({ intentId, token, dashboardUrl, expected, onNetwork, onSigned }: Props) {
  const [state, dispatch] = useReducer(flowReducer, INITIAL_FLOW);
  const [details, setDetails] = useState<SigningIntentDetails | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  // The accepted Key 1 words, kept out of React state; state only says whether there are any.
  const validMnemonicRef = useRef<string | null>(null);
  const signingInProgress = useRef(false);

  const { stage } = state;
  const kind = kindOf(details?.action_type);
  const now = useNow(deadline, 15_000);
  const expired = deadline !== null && now >= deadline;
  const awaitingOwner = stage === 'review' || stage === 'enter-key';

  const fail = useCallback((error: unknown, phase: SignPhase, failedKind: ActionKind) => {
    if (error instanceof TransactionMismatchError) console.warn('Refused to sign:', error.message);
    const failure = describeFailure(error, phase, failedKind);
    if (failure.endSession) clearStoredSession();
    dispatch({ type: 'failed', failure });
  }, []);

  const handleMnemonicValid = useCallback((mnemonic: string) => {
    validMnemonicRef.current = mnemonic;
    dispatch({ type: 'key-ready', ready: true });
  }, []);

  const handleMnemonicReset = useCallback(() => {
    validMnemonicRef.current = null;
    dispatch({ type: 'key-ready', ready: false });
  }, []);

  const handleRetryReady = useCallback(() => dispatch({ type: 'retry-ready' }), []);

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
        dispatch({ type: 'failed', failure: mayHaveGoneThrough(kindOf(data.action_type)) });
        return;
      }
      clearSubmitting();
      dispatch({ type: 'loaded', retryAt: attempt.kind === 'wait' ? attempt.until : null });
    } catch (e) {
      fail(e, 'load', kind);
    }
  }

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

  // Load the details once per link; retry() loads them again.
  const latestLoadIntent = useLatest(loadIntent);
  useEffect(() => {
    latestLoadIntent.current();
  }, [intentId, token, latestLoadIntent]);

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
  // down and let the owner go on. (kind changes only when the details load, which also
  // changes awaitingOwner, so it adds no runs of its own.)
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
        fail(e, 'load', kind);
      },
    );
    return () => { cancelled = true; };
  }, [expired, awaitingOwner, intentId, token, kind, fail, handleMnemonicReset]);

  function goToEnterKey() {
    dispatch({ type: 'enter-key' });
  }

  function goBackToReview() {
    handleMnemonicReset();
    dispatch({ type: 'back' });
  }

  function retry(target: 'sign' | 'load') {
    if (target === 'load') {
      dispatch({ type: 'load' });
      loadIntent();
    } else {
      // Same intent and token: signing_frost_init accepts the link again while it is
      // 'pending', which includes a signing round the server released after it timed out.
      handleMnemonicReset();
      dispatch({ type: 'enter-key' });
    }
  }

  async function handleSign() {
    if (signingInProgress.current) return;

    const mnemonic = validMnemonicRef.current;
    if (!mnemonic || !details) return;
    signingInProgress.current = true;
    dispatch({ type: 'sign' });

    try {
      const outcome = await signWithKey1({
        intentId,
        token,
        mnemonic,
        details,
        onStatus: status => dispatch({ type: 'status', status }),
      });

      if (outcome.ok) {
        clearStoredSession();
        dispatch({ type: 'succeeded', receipt: toReceipt(outcome.result) });
        onSigned?.();
        return;
      }

      // The reply (or its absence) is explained on the next screen from here.
      const sent = outcome.phase === 'complete' ? sentUnconfirmed(outcome.error) : null;
      if (sent) {
        // Not a failure: it may still go through, so wait here for Solana's answer
        dispatch({ type: 'sent', sent });
      } else {
        fail(outcome.error, outcome.phase, kind);
      }
    } finally {
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

  function settleConfirming(outcome: Exclude<Confirmation, 'confirming'>, signature: string | null) {
    clearStoredSession();
    if (outcome === 'completed' && details) {
      dispatch({ type: 'succeeded', receipt: confirmedReceipt(details, signature) });
      onSigned?.();
      return;
    }
    dispatch({ type: 'failed', failure: afterConfirming(outcome === 'failed' ? 'failed' : 'unknown', kind) });
  }

  switch (state.stage) {
    case 'loading':
      return <LoadingStep />;

    case 'error': {
      const { failure } = state;
      const target = failure.retry;
      return (
        <ErrorView
          failure={failure}
          dashboardUrl={dashboardUrl}
          onRetry={target ? () => retry(target) : undefined}
        />
      );
    }

    // Signing, review and Key 1 all render StepFrame in this same place, so its card stays
    // on screen between those steps instead of animating in again.
    case 'signing':
      return (
        <>
          <ProgressBar stage={stage} />
          <StepFrame signing>
            <SigningStep status={state.status} />
          </StepFrame>
        </>
      );
  }

  // The other screens come after the details loaded.
  if (!details) return null;

  switch (state.stage) {
    case 'confirming': {
      const { signature } = state.sent;
      return (
        <>
          <ProgressBar stage={stage} />
          <ConfirmingView
            kind={kind}
            amount={details.amount}
            signature={signature}
            network={details.network}
            dashboardUrl={dashboardUrl}
            check={checkConfirmation}
            onSettled={outcome => settleConfirming(outcome, signature)}
          />
        </>
      );
    }

    case 'success':
      return (
        <>
          <ProgressBar stage={stage} />
          <SuccessView receipt={state.receipt} details={details} kind={kind} dashboardUrl={dashboardUrl} />
        </>
      );

    case 'review':
      return (
        <>
          <ProgressBar stage={stage} />
          <StepFrame>
            <ReviewStep
              details={details}
              kind={kind}
              retryAt={state.retryAt}
              deadline={deadline}
              now={now}
              expired={expired}
              dashboardUrl={dashboardUrl}
              onContinue={goToEnterKey}
              onRetryReady={handleRetryReady}
            />
          </StepFrame>
        </>
      );

    case 'enter-key':
      return (
        <>
          <ProgressBar stage={stage} />
          <StepFrame below={<KeyStepNote />}>
            <KeyStep
              details={details}
              kind={kind}
              keyReady={state.keyReady}
              deadline={deadline}
              now={now}
              expired={expired}
              dashboardUrl={dashboardUrl}
              onBack={goBackToReview}
              onKeyValid={handleMnemonicValid}
              onKeyReset={handleMnemonicReset}
              onSign={handleSign}
            />
          </StepFrame>
        </>
      );
  }
}

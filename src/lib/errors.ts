import { ApiError } from './api';
import { TransactionMismatchError } from './verify-transaction';

/**
 * Where signing was when it failed. Nothing reaches Solana before 'complete':
 *   load     get_signing_intent
 *   prepare  reading Key 1 and making the nonce, in this browser
 *   init     signing_frost_init (the link is still 'pending' unless this call went through)
 *   sign     partial signature, in this browser (the server now holds the link as 'signing')
 *   complete signing_frost_complete, which submits the transaction
 */
export type SignPhase = 'load' | 'prepare' | 'init' | 'sign' | 'complete';

export type ActionKind = 'withdrawal' | 'transfer';

export interface Failure {
  title: string;
  /** What happened, including whether any money moved. */
  message: string;
  /** What the owner should do now. */
  next: string;
  tone: 'warning' | 'error';
  /** 'sign' goes back to the Key 1 step with the same link; 'load' reloads the details. */
  retry?: 'sign' | 'load';
  /** The retry button's text, when "Try Again" would be wrong. */
  retryLabel?: string;
  /** The link can't be used again, so the saved session is dropped. */
  endSession: boolean;
  /** Shown for unexpected errors so support can look them up. */
  code?: string;
}

// Errors from signing_frost_complete that are returned before the transaction is submitted.
const PRE_SUBMIT_CODES = new Set(['VALIDATION_ERROR', 'NOT_FOUND', 'MISSING_PUBLIC_SHARE', 'WALLET_NOT_FOUND']);

function notSent(kind: ActionKind, message: string, next: string, code?: string): Failure {
  return {
    title: kind === 'transfer' ? 'Transfer Not Sent' : 'Withdrawal Not Sent',
    message,
    next,
    tone: 'error',
    endSession: true,
    code,
  };
}

function unconfirmed(kind: ActionKind, code?: string): Failure {
  return {
    title: "Couldn't Confirm the Result",
    message: `We couldn't confirm the result. The ${kind} may have gone through.`,
    next: 'Check your wallet in the dashboard before trying again.',
    tone: 'warning',
    endSession: true,
    code: code === 'NETWORK_ERROR' ? undefined : code,
  };
}

/**
 * The transfer was sent to Solana and the network hasn't confirmed it yet, so it may still
 * go through. Checking again reloads the details: once Solana confirms or drops it, the
 * server reports the link as completed or failed. Right after signing, SigningFlow shows
 * this as a confirming screen that checks by itself (confirming.ts).
 */
export function stillConfirming(kind: ActionKind): Failure {
  return {
    title: 'Confirming on Solana',
    message: `Your ${kind} was sent to Solana and is waiting for the network to confirm it. It may have gone through already.`,
    next: "Don't send it again. Check again in a minute, or check your wallet in the dashboard.",
    tone: 'warning',
    retry: 'load',
    retryLabel: 'Check Again',
    endSession: false,
  };
}

/** How a sent transfer ended when the page was waiting for Solana, unless it went through. */
export function afterConfirming(outcome: 'failed' | 'unknown', kind: ActionKind): Failure {
  if (outcome === 'failed') {
    return notSent(kind, `The ${kind} didn't go through on Solana, so nothing was sent.`, `Start a new ${kind} from your dashboard.`);
  }
  return unconfirmed(kind);
}

function usedLink(serverMessage: string, kind: ActionKind): Failure {
  // The server says "This signing session is already <status>".
  const status = /already (completed|failed|expired)\b/i.exec(serverMessage)?.[1]?.toLowerCase();
  if (status === 'completed') {
    return {
      title: 'Already Completed',
      message: `This link was already used, and the ${kind} went through.`,
      next: 'Check your wallet in the dashboard to see it.',
      tone: 'warning',
      endSession: true,
    };
  }
  if (status === 'failed' || status === 'expired') {
    return {
      title: 'Session Expired',
      message: status === 'failed'
        ? 'An earlier attempt with this link failed, so nothing was sent.'
        : 'Signing links work for 15 minutes. This one has expired, so nothing was sent.',
      next: `Start a new ${kind} from your dashboard.`,
      tone: 'warning',
      endSession: true,
    };
  }
  return {
    title: 'Session Expired',
    message: 'This link has already been used.',
    next: `Check your wallet in the dashboard to see whether the ${kind} went through before starting a new one.`,
    tone: 'warning',
    endSession: true,
  };
}

// The page refused to sign: the details or the transaction didn't match what the owner approved.
function mismatch(phase: SignPhase, kind: ActionKind): Failure {
  const support = 'If it happens again, email support@botwallet.co.';
  if (phase === 'load') {
    return {
      title: "Details Don't Match",
      message: `This ${kind} doesn't match what you entered in the dashboard, so it can't be signed here. Nothing was sent.`,
      next: `Start a new ${kind} from your dashboard. ${support}`,
      tone: 'error',
      endSession: true,
      code: 'DETAILS_MISMATCH',
    };
  }
  return {
    title: 'Stopped Before Signing',
    message: `The transaction we got back doesn't match the ${kind} you reviewed, so Key 1 didn't sign it. Nothing was sent.`,
    next: `Start a new ${kind} from your dashboard. ${support}`,
    tone: 'error',
    endSession: true,
    code: 'TX_MISMATCH',
  };
}

/**
 * Shown instead of the review when an earlier attempt with this link may already have sent
 * the money (see earlier-attempt.ts). Checking again reloads the details: once that attempt
 * finishes, the server reports the link as completed or failed.
 */
export function mayHaveGoneThrough(kind: ActionKind): Failure {
  return {
    title: 'Check Your Wallet First',
    message: `Signing with this link already started, and the ${kind} may have gone through.`,
    next: `Check your wallet in the dashboard before trying again or starting a new ${kind}.`,
    tone: 'warning',
    retry: 'load',
    retryLabel: 'Check Again',
    endSession: false,
  };
}

export function describeFailure(error: unknown, phase: SignPhase, kind: ActionKind): Failure {
  if (error instanceof TransactionMismatchError) return mismatch(phase, kind);

  const code = error instanceof ApiError ? error.code : 'CLIENT_ERROR';
  const serverMessage = error instanceof ApiError ? error.message : '';
  const startNew = `Start a new ${kind} from your dashboard.`;

  switch (code) {
    case 'INTENT_EXPIRED':
      return {
        title: 'Session Expired',
        message: 'Signing links work for 15 minutes. This one has expired, so nothing was sent.',
        next: startNew,
        tone: 'warning',
        endSession: true,
      };
    case 'INVALID_TOKEN':
      return {
        title: 'Session Expired',
        message: "This signing link isn't valid anymore, so nothing was sent.",
        next: startNew,
        tone: 'warning',
        endSession: true,
      };
    case 'INTENT_COMPLETED':
      // Sent to Solana with this link, and not confirmed yet. The server names the kind.
      if (/still being confirmed/i.test(serverMessage)) {
        const named = /\b(transfer|withdrawal)\b/i.exec(serverMessage)?.[1]?.toLowerCase();
        return stillConfirming(named === 'transfer' || named === 'withdrawal' ? named : kind);
      }
      // An earlier attempt with this link is still inside its 60-second signing round
      // (another tab, or a reply that never arrived). The server frees the link after that.
      if (/already being signed/i.test(serverMessage)) {
        return {
          title: 'Already Signing',
          message: `This ${kind} is already being signed, maybe in another tab.`,
          next: 'Wait a minute, then check your wallet in the dashboard. If nothing was sent, try again with this link.',
          tone: 'warning',
          retry: 'sign',
          endSession: false,
        };
      }
      return usedLink(serverMessage, kind);
    case 'KEY_MISMATCH':
      return {
        title: "Key 1 Doesn't Match",
        message: "These 12 words aren't Key 1 for this wallet. Your funds are safe — nothing was sent.",
        next: 'Double-check you are entering Key 1 from your agent backup, not Key 2.',
        tone: 'warning',
        retry: 'sign',
        endSession: false,
      };
    case 'SESSION_EXPIRED':
      // When the 60-second signing round lapsed before anything was submitted, the server
      // puts the link back to 'pending', so the same link can sign again. Other
      // SESSION_EXPIRED replies can answer a repeated request while the first one is still
      // submitting (browsers re-send a request whose connection dropped), so their outcome
      // is unknown.
      if (/60 second limit/i.test(serverMessage) && /nothing was sent/i.test(serverMessage)) {
        return {
          title: 'Signing Timed Out',
          message: 'This took longer than 60 seconds, so nothing was sent.',
          next: 'Try again with the same link. You will need to enter Key 1 again.',
          tone: 'warning',
          retry: 'sign',
          endSession: false,
        };
      }
      return unconfirmed(kind, code);
    case 'INSUFFICIENT_FUNDS':
      return notSent(kind, `Your wallet doesn't have enough USDC for this ${kind} and its fee, so nothing was sent.`, startNew);
    case 'BALANCE_CHECK_FAILED':
      return notSent(kind, "We couldn't check your wallet balance just now, so nothing was sent.", `Wait a minute, then start a new ${kind} from your dashboard.`);
    case 'RECIPIENT_ATA_CLOSED':
      return notSent(
        kind,
        `The recipient's USDC account was closed after this ${kind} was set up, so nothing was sent.`,
        `Start a new ${kind} from your dashboard. It will include the one-time account setup fee.`,
      );
    case 'SUBMISSION_UNCONFIRMED':
      return stillConfirming(kind);
    case 'TRANSACTION_FAILED':
      return notSent(kind, 'The Solana network rejected the transaction, so nothing was sent.', startNew, code);
    case 'INVALID_PARTIAL_SIG':
      return notSent(kind, "The signature couldn't be verified, so nothing was sent.", startNew, code);
  }

  const offline = code === 'NETWORK_ERROR';
  const shownCode = offline ? undefined : code;
  // No usable response: the request may never have reached the server.
  const noResponse = offline || code === 'PARSE_ERROR' || code === 'UNKNOWN';

  if (phase === 'load') {
    return {
      title: "Couldn't Load the Details",
      message: offline
        ? "We couldn't reach Botwallet to load this request. Nothing was sent."
        : "We couldn't load this request. Nothing was sent.",
      next: 'Check your connection and try again.',
      tone: 'warning',
      retry: 'load',
      endSession: false,
      code: shownCode,
    };
  }
  // SERVICE_UNAVAILABLE: the server couldn't check the link, so it didn't change it.
  if (phase === 'prepare' || (phase === 'init' && (noResponse || code === 'SERVICE_UNAVAILABLE'))) {
    // Nothing was submitted, and the link is still usable unless the init call went through.
    return {
      title: offline ? "Couldn't Reach Botwallet" : 'Something Went Wrong',
      message: offline
        ? "We couldn't reach Botwallet, so nothing was sent."
        : "Signing didn't go through, so nothing was sent.",
      next: offline
        ? 'Check your connection and try again.'
        : `Try again. If it keeps happening, start a new ${kind} from your dashboard.`,
      tone: 'warning',
      retry: 'sign',
      endSession: false,
      code: shownCode,
    };
  }
  if (phase === 'init') {
    return notSent(kind, 'Something went wrong on our side, so nothing was sent.', startNew, code);
  }
  if (phase === 'sign') {
    return notSent(kind, "Signing didn't finish in this browser, so nothing was sent.", startNew, code);
  }
  // phase === 'complete': the transaction may have been submitted.
  if (PRE_SUBMIT_CODES.has(code)) {
    return notSent(kind, 'Something went wrong on our side, so nothing was sent.', startNew, code);
  }
  return unconfirmed(kind, code);
}

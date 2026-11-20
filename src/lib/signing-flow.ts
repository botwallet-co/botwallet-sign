// The signing page's screens and what each one needs, for SigningFlow's useReducer. Pure,
// so the transitions are tested on their own (tests/signing-flow.test.ts). The details and
// the link's deadline are kept beside this state, in SigningFlow.

import type { SentUnconfirmed } from './confirming';
import type { Failure } from './errors';
import type { Receipt } from './receipt';

/**
 *   loading     get_signing_intent
 *   review      step 1. retryAt: Continue waits until then, while an earlier signing round is open
 *   enter-key   step 2. keyReady: MnemonicInput accepted Key 1
 *   signing     Key 1 is signing (sign.ts). status: the current step, for the owner
 *   confirming  sent to Solana, waiting for the network to confirm it (ConfirmingView)
 *   success     the receipt
 *   error       what happened, and what the owner can do now
 */
export type FlowState =
  | { stage: 'loading' }
  | { stage: 'review'; retryAt: number | null }
  | { stage: 'enter-key'; keyReady: boolean }
  | { stage: 'signing'; status: string }
  | { stage: 'confirming'; sent: SentUnconfirmed }
  | { stage: 'success'; receipt: Receipt }
  | { stage: 'error'; failure: Failure };

export type Stage = FlowState['stage'];

export type FlowAction =
  | { type: 'load' }
  | { type: 'loaded'; retryAt: number | null }
  | { type: 'retry-ready' }
  | { type: 'enter-key' }
  | { type: 'key-ready'; ready: boolean }
  | { type: 'back' }
  | { type: 'sign' }
  | { type: 'status'; status: string }
  | { type: 'sent'; sent: SentUnconfirmed }
  | { type: 'succeeded'; receipt: Receipt }
  | { type: 'failed'; failure: Failure };

export const INITIAL_FLOW: FlowState = { stage: 'loading' };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'load':
      return { stage: 'loading' };
    case 'loaded':
      return { stage: 'review', retryAt: action.retryAt };
    case 'retry-ready':
      return state.stage === 'review' ? { stage: 'review', retryAt: null } : state;
    case 'enter-key':
      // The Key 1 boxes start empty every time, so there is no accepted key yet.
      return { stage: 'enter-key', keyReady: false };
    case 'key-ready':
      return state.stage === 'enter-key' ? { stage: 'enter-key', keyReady: action.ready } : state;
    case 'back':
      // Continue was enabled to get to the key step, so nothing is holding it now.
      return { stage: 'review', retryAt: null };
    case 'sign':
      return { stage: 'signing', status: '' };
    case 'status':
      return state.stage === 'signing' ? { stage: 'signing', status: action.status } : state;
    case 'sent':
      return { stage: 'confirming', sent: action.sent };
    case 'succeeded':
      return { stage: 'success', receipt: action.receipt };
    case 'failed':
      return { stage: 'error', failure: action.failure };
  }
}

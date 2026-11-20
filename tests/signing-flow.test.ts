// The signing page's screens (SigningFlow's reducer). Each screen holds only what it needs,
// so a Key 1 accepted on one visit to the key step can never turn Sign & Submit on for the
// next visit, when the boxes start empty.

import { describe, it, expect } from 'vitest';
import type { Failure } from '../src/lib/errors';
import type { Receipt } from '../src/lib/receipt';
import { flowReducer, INITIAL_FLOW, type FlowAction, type FlowState } from '../src/lib/signing-flow';

const FAILURE: Failure = {
  title: 'Signing Timed Out',
  message: 'This took longer than 60 seconds, so nothing was sent.',
  next: 'Try again with the same link. You will need to enter Key 1 again.',
  tone: 'warning',
  retry: 'sign',
  endSession: false,
};
const RECEIPT: Receipt = { signature: null, amountUsdc: '12.34', feeUsdc: '1.25' };

const loaded: FlowAction = { type: 'loaded', retryAt: null };
const enterKey: FlowAction = { type: 'enter-key' };
const keyAccepted: FlowAction = { type: 'key-ready', ready: true };
const sign: FlowAction = { type: 'sign' };
const failed: FlowAction = { type: 'failed', failure: FAILURE };

function run(...actions: FlowAction[]): FlowState {
  return actions.reduce(flowReducer, INITIAL_FLOW);
}

describe('flowReducer', () => {
  it('starts by loading the details', () => {
    expect(INITIAL_FLOW).toEqual({ stage: 'loading' });
  });

  it('goes from the review through Key 1 and signing to the receipt', () => {
    expect(run(loaded)).toEqual({ stage: 'review', retryAt: null });
    expect(run(loaded, enterKey)).toEqual({ stage: 'enter-key', keyReady: false });
    expect(run(loaded, enterKey, keyAccepted)).toEqual({ stage: 'enter-key', keyReady: true });
    expect(run(loaded, enterKey, keyAccepted, { type: 'key-ready', ready: false }))
      .toEqual({ stage: 'enter-key', keyReady: false });
    expect(run(loaded, enterKey, keyAccepted, sign)).toEqual({ stage: 'signing', status: '' });
    expect(run(loaded, enterKey, keyAccepted, sign, { type: 'status', status: 'Signing in this browser…' }))
      .toEqual({ stage: 'signing', status: 'Signing in this browser…' });
    expect(run(loaded, enterKey, keyAccepted, sign, { type: 'succeeded', receipt: RECEIPT }))
      .toEqual({ stage: 'success', receipt: RECEIPT });
  });

  it('waits for Solana after a submission that was not confirmed yet', () => {
    expect(run(loaded, enterKey, keyAccepted, sign, { type: 'sent', sent: { signature: 'sig' } }))
      .toEqual({ stage: 'confirming', sent: { signature: 'sig' } });
  });

  it('holds Continue until an earlier signing round is over', () => {
    const waiting = run({ type: 'loaded', retryAt: 1_000 });
    expect(waiting).toEqual({ stage: 'review', retryAt: 1_000 });
    expect(flowReducer(waiting, { type: 'retry-ready' })).toEqual({ stage: 'review', retryAt: null });
  });

  it('always starts the key step without a key', () => {
    // Back to the review and on again
    expect(run(loaded, enterKey, keyAccepted, { type: 'back' })).toEqual({ stage: 'review', retryAt: null });
    expect(run(loaded, enterKey, keyAccepted, { type: 'back' }, enterKey)).toEqual({ stage: 'enter-key', keyReady: false });
    // Signing failed, then Try Again
    expect(run(loaded, enterKey, keyAccepted, sign, failed, enterKey)).toEqual({ stage: 'enter-key', keyReady: false });
    // Signing failed, then Check Again loaded the details again
    expect(run(loaded, enterKey, keyAccepted, sign, failed, { type: 'load' }, loaded, enterKey))
      .toEqual({ stage: 'enter-key', keyReady: false });
  });

  it('shows a failure from any screen, and Check Again loads again', () => {
    for (const state of [
      INITIAL_FLOW,
      run(loaded),
      run(loaded, enterKey, keyAccepted),
      run(loaded, enterKey, keyAccepted, sign),
      run(loaded, enterKey, keyAccepted, sign, { type: 'sent', sent: { signature: null } }),
    ]) {
      expect(flowReducer(state, failed)).toEqual({ stage: 'error', failure: FAILURE });
    }
    expect(run(failed, { type: 'load' })).toEqual({ stage: 'loading' });
  });

  it('ignores updates meant for another screen', () => {
    const review = run(loaded);
    expect(flowReducer(review, keyAccepted)).toBe(review);
    expect(flowReducer(review, { type: 'status', status: 'Signing in this browser…' })).toBe(review);

    const keyStep = run(loaded, enterKey);
    expect(flowReducer(keyStep, { type: 'retry-ready' })).toBe(keyStep);

    // Try Again resets the key while the error is still showing, which changes nothing there
    const error = run(loaded, failed);
    expect(flowReducer(error, { type: 'key-ready', ready: false })).toBe(error);
  });
});

// =============================================================================
// Signing with Key 1, in this browser
// =============================================================================
// The order of these steps is what keeps Key 1 safe, and tests/sign.test.ts
// holds it in place:
//   1. Key 1's share and a fresh nonce, made here.
//   2. signing_frost_init: Botwallet starts the round and returns the
//      transaction it built, after checking Key 1's public share.
//   3. The transaction is checked against the reviewed details
//      (verify-transaction.ts). Only then does Key 1 sign it.
//   4. signing_frost_complete: Botwallet adds its half and submits it. From
//      here the money may move, so this tab keeps a marker until the reply
//      arrives (earlier-attempt.ts reads it after a reload).
// Byte buffers holding key material are zeroed as soon as they are used, and
// again on the way out whatever happened.
// =============================================================================

import {
  signingFrostInit, signingFrostComplete, type FrostCompleteResult, type SigningIntentDetails,
} from './api';
import { toBase64, fromBase64 } from './encoding';
import type { SignPhase } from './errors';
import { computePartialSig, derivePublicShare, generateNonce, zeroMemory } from './frost';
import { mnemonicToScalar } from './mnemonic';
import { clearSubmitting, markSubmitting } from './tab-session';
import { verifyTransaction } from './verify-transaction';

export interface SignRequest {
  intentId: string;
  token: string;
  /** Key 1's 12 words, as MnemonicInput accepted them. */
  mnemonic: string;
  /** The details the owner reviewed. Key 1 signs only a transaction that does exactly this. */
  details: SigningIntentDetails;
  /** Reports each step, for the signing screen. */
  onStatus: (status: string) => void;
}

/** How a signing attempt ended. `phase` says how far it got, which decides what the owner is told (errors.ts). */
export type SignOutcome =
  | { ok: true; result: FrostCompleteResult }
  | { ok: false; phase: SignPhase; error: unknown };

/** Signs the reviewed transaction with Key 1 and submits it. Never throws. */
export async function signWithKey1({ intentId, token, mnemonic, details, onStatus }: SignRequest): Promise<SignOutcome> {
  let phase: SignPhase = 'prepare';
  let s1Scalar: Uint8Array | null = null;
  let nonceSecret: Uint8Array | null = null;
  let partialSig: Uint8Array | null = null;

  try {
    onStatus('Checking Key 1…');
    s1Scalar = mnemonicToScalar(mnemonic);
    const s1PublicShare = derivePublicShare(s1Scalar);
    const s1PublicShareB64 = toBase64(s1PublicShare);

    onStatus('Preparing the signature…');
    const nonce = generateNonce();
    nonceSecret = nonce.secret;
    const nonceCommitmentB64 = toBase64(nonce.commitment);

    onStatus('Starting secure signing…');
    phase = 'init';
    const initResult = await signingFrostInit(intentId, token, nonceCommitmentB64, s1PublicShareB64);

    onStatus('Signing in this browser…');
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

    onStatus('Sending to the Solana network…');
    phase = 'complete';
    markSubmitting(intentId);
    const result = await signingFrostComplete(
      intentId,
      token,
      initResult.session_id,
      toBase64(partialSig),
    );

    zeroMemory(partialSig);
    partialSig = null;

    // Answered: the marker has done its job (the caller also ends the session now).
    clearSubmitting();
    return { ok: true, result };
  } catch (error) {
    // The reply (or its absence) is explained on the next screen from the phase.
    if (phase === 'complete') clearSubmitting();
    return { ok: false, phase, error };
  } finally {
    if (s1Scalar) zeroMemory(s1Scalar);
    if (nonceSecret) zeroMemory(nonceSecret);
    if (partialSig) zeroMemory(partialSig);
  }
}

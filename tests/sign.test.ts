// The order of the signing steps is what keeps Key 1 safe (src/lib/sign.ts): the
// transaction Botwallet built is checked before Key 1 signs it, nothing is sent for
// submission unless the check passed, the tab marks the submission only while it is under
// way, and key material is wiped whatever happens. These tests play Botwallet's part,
// including Key 2's half of the signature.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { ApiError, type FrostCompleteResult, type SigningIntentDetails } from '../src/lib/api';
import { fromBase64, toBase64 } from '../src/lib/encoding';
import { signWithKey1, type SignOutcome } from '../src/lib/sign';
import { associatedTokenAddress } from '../src/lib/solana';
import { wasSubmitting } from '../src/lib/tab-session';
import { TransactionMismatchError } from '../src/lib/verify-transaction';
import {
  ata, base58Encode, buildServerMessage, bytesToNumberLE, hexToBytes, key, numberToBytes32LE,
  USDC_MAINNET, type ServerBuild,
} from './helpers';

// Every buffer of key material the frost module hands out: Key 1's share, the nonce secret
// and the partial signature.
const handedOut = vi.hoisted(() => ({ buffers: [] as Uint8Array[], partialSigs: 0 }));

vi.mock('../src/lib/frost', async importOriginal => {
  const frost = await importOriginal<typeof import('../src/lib/frost')>();
  return {
    ...frost,
    scalarFromEntropy: (entropy: Uint8Array) => {
      const scalar = frost.scalarFromEntropy(entropy);
      handedOut.buffers.push(scalar);
      return scalar;
    },
    generateNonce: () => {
      const nonce = frost.generateNonce();
      handedOut.buffers.push(nonce.secret);
      return nonce;
    },
    computePartialSig: (...args: Parameters<typeof frost.computePartialSig>) => {
      const partialSig = frost.computePartialSig(...args);
      handedOut.buffers.push(partialSig);
      handedOut.partialSigs++;
      return partialSig;
    },
  };
});

// The real module, for the keys below and Botwallet's half of the signature
const frost = await vi.importActual<typeof import('../src/lib/frost')>('../src/lib/frost');

const L = ed25519.CURVE.n;
const Point = ed25519.ExtendedPoint;

// Key 1 for 16 bytes 00 01 ... 0f, and a Key 2 share. tests/frost.test.ts pins both
// derivations to the Go vectors.
const KEY1_ENTROPY = '000102030405060708090a0b0c0d0e0f';
const KEY1_WORDS = entropyToMnemonic(hexToBytes(KEY1_ENTROPY), wordlist);
const KEY1_SCALAR = frost.scalarFromEntropy(hexToBytes(KEY1_ENTROPY));
const KEY1_PUBLIC = frost.derivePublicShare(KEY1_SCALAR);
const KEY2_SCALAR = frost.scalarFromEntropy(hexToBytes('01010101010101010101010101010101'));
// The wallet's address is the group key, Key 1's and Key 2's public shares added up.
const WALLET = Point.fromHex(KEY1_PUBLIC).add(Point.fromHex(frost.derivePublicShare(KEY2_SCALAR))).toRawBytes();

const INTENT_ID = 'intent-1';
const TOKEN = 'token-1';
const recipient = key('recipient');
const feeOwner = key('fee-collector');

const DETAILS: SigningIntentDetails = {
  amount: '12.34',
  fee_usdc: '1.25',
  fee_breakdown: { platform_fee_usdc: '1.25', account_setup_fee_usdc: '0.00' },
  from_address: base58Encode(WALLET),
  from_name: 'Research agent',
  to_address: base58Encode(recipient),
  to_name: null,
  network: 'mainnet-beta',
  action_type: 'withdraw',
  expires_at: '2026-10-04T12:15:00Z',
};

function transferMessage(overrides: Partial<ServerBuild> = {}): Uint8Array {
  return buildServerMessage({
    feePayer: key('fee-payer'),
    wallet: WALLET,
    fromTokenAccount: associatedTokenAddress(WALLET, USDC_MAINNET),
    toWallet: recipient,
    toTokenAccount: ata(recipient, true),
    feeCollection: { owner: feeOwner, account: ata(feeOwner, true) },
    amount: 12_340_000n,
    fee: 1_250_000n,
    ...overrides,
  });
}

const RESULT: FrostCompleteResult = {
  solana_signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
  amount_usdc: '12.34',
  fee_usdc: '1.25',
  new_balance_usdc: '86.41',
};

const STATUSES = [
  'Checking Key 1…',
  'Preparing the signature…',
  'Starting secure signing…',
  'Signing in this browser…',
  'Sending to the Solana network…',
];

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function refusal(status: number, code: string, message: string): Response {
  return reply(status, { success: false, error: { code, message } });
}

/** Botwallet's side of signing_frost_init and signing_frost_complete. */
class Botwallet {
  readonly requests: { action: string; data: Record<string, string> }[] = [];
  /** The transaction signing_frost_init hands back to be signed, and the key it names. */
  message = transferMessage();
  groupKey = WALLET;
  initReply: (() => Response) | null = null;
  completeReply: (() => Promise<Response>) | null = null;
  /** Whether this tab had marked the submission when each request arrived. */
  markedAtInit: boolean | null = null;
  markedAtComplete: boolean | null = null;
  /** The whole signature, once Key 2 has added its half. */
  signature: Uint8Array | null = null;
  private readonly nonce = frost.generateNonce();

  readonly fetch = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
    const { action, data } = JSON.parse(init.body as string);
    this.requests.push({ action, data });

    if (action === 'signing_frost_init') {
      this.markedAtInit = wasSubmitting(INTENT_ID);
      if (this.initReply) return this.initReply();
      return reply(200, {
        success: true,
        data: {
          session_id: 'session-1',
          server_nonce_commitment: toBase64(this.nonce.commitment),
          group_key: toBase64(this.groupKey),
          message_to_sign: toBase64(this.message),
        },
      });
    }

    if (action === 'signing_frost_complete') {
      this.markedAtComplete = wasSubmitting(INTENT_ID);
      if (this.completeReply) return this.completeReply();
      const theirCommitment = fromBase64(this.requests[0].data.nonce_commitment);
      const ourHalf = frost.computePartialSig(
        this.nonce.secret, this.nonce.commitment, theirCommitment, WALLET, this.message, KEY2_SCALAR,
      );
      const z = (bytesToNumberLE(fromBase64(data.partial_sig)) + bytesToNumberLE(ourHalf)) % L;
      const groupNonce = Point.fromHex(theirCommitment).add(Point.fromHex(this.nonce.commitment)).toRawBytes();
      this.signature = new Uint8Array([...groupNonce, ...numberToBytes32LE(z)]);
      return reply(200, { success: true, data: RESULT });
    }

    throw new Error(`unexpected action ${action}`);
  });

  actions(): string[] {
    return this.requests.map(r => r.action);
  }
}

let botwallet: Botwallet;
let statuses: string[];

function sign(mnemonic = KEY1_WORDS): Promise<SignOutcome> {
  return signWithKey1({ intentId: INTENT_ID, token: TOKEN, mnemonic, details: DETAILS, onStatus: s => statuses.push(s) });
}

function expectKeyMaterialWiped() {
  // At least Key 1's share and the nonce secret
  expect(handedOut.buffers.length).toBeGreaterThanOrEqual(2);
  for (const buffer of handedOut.buffers) expect(buffer.every(b => b === 0)).toBe(true);
}

beforeEach(() => {
  handedOut.buffers = [];
  handedOut.partialSigs = 0;
  statuses = [];
  botwallet = new Botwallet();
  vi.stubGlobal('fetch', botwallet.fetch);
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signWithKey1', () => {
  it("signs the reviewed transaction, and Key 2's half completes a valid signature", async () => {
    expect(await sign()).toEqual({ ok: true, result: RESULT });
    expect(botwallet.actions()).toEqual(['signing_frost_init', 'signing_frost_complete']);
    expect(ed25519.verify(botwallet.signature!, botwallet.message, WALLET)).toBe(true);
    expect(statuses).toEqual(STATUSES);
  });

  it("starts the round with a fresh nonce commitment and Key 1's public share", async () => {
    await sign();
    const [init, complete] = botwallet.requests;
    expect(init.data.intent_id).toBe(INTENT_ID);
    expect(init.data.signing_token).toBe(TOKEN);
    const commitment = fromBase64(init.data.nonce_commitment);
    expect(commitment).toHaveLength(32);
    expect(() => Point.fromHex(commitment)).not.toThrow();
    expect(init.data.agent_public_share).toBe(toBase64(KEY1_PUBLIC));

    expect(complete.data).toMatchObject({ intent_id: INTENT_ID, signing_token: TOKEN, session_id: 'session-1' });
    expect(fromBase64(complete.data.partial_sig)).toHaveLength(32);

    // Key 1's share itself never leaves the browser
    expect(JSON.stringify(botwallet.requests)).not.toContain(toBase64(KEY1_SCALAR));
  });

  it('marks the submission only while signing_frost_complete is under way', async () => {
    await sign();
    expect(botwallet.markedAtInit).toBe(false);
    expect(botwallet.markedAtComplete).toBe(true);
    expect(wasSubmitting(INTENT_ID)).toBe(false);
  });

  it('wipes Key 1, the nonce and the partial signature after signing', async () => {
    await sign();
    expect(handedOut.partialSigs).toBe(1);
    expectKeyMaterialWiped();
  });

  describe('refuses before Key 1 signs', () => {
    async function expectRefusedBeforeSigning() {
      const outcome = await sign();
      expect(outcome).toMatchObject({ ok: false, phase: 'sign' });
      expect(!outcome.ok && outcome.error).toBeInstanceOf(TransactionMismatchError);
      // Key 1 never signed, nothing went for submission, and no submission was marked
      expect(handedOut.partialSigs).toBe(0);
      expect(botwallet.actions()).toEqual(['signing_frost_init']);
      expect(wasSubmitting(INTENT_ID)).toBe(false);
      expectKeyMaterialWiped();
    }

    it('a transaction that pays more than the review', async () => {
      botwallet.message = transferMessage({ amount: 99_000_000n });
      await expectRefusedBeforeSigning();
    });

    it('a transaction that pays someone else', async () => {
      const attacker = key('attacker');
      botwallet.message = transferMessage({ toWallet: attacker, toTokenAccount: ata(attacker, true) });
      await expectRefusedBeforeSigning();
    });

    it('a group key that is not the wallet', async () => {
      botwallet.groupKey = key('another wallet');
      await expectRefusedBeforeSigning();
    });
  });

  it('stops at init when Botwallet refuses Key 1', async () => {
    botwallet.initReply = () => refusal(400, 'KEY_MISMATCH', "Those words aren't Key 1 for this wallet. Nothing was sent. Check the words and try again.");
    const outcome = await sign();
    expect(outcome).toMatchObject({ ok: false, phase: 'init' });
    expect(!outcome.ok && outcome.error).toBeInstanceOf(ApiError);
    expect(!outcome.ok && (outcome.error as ApiError).code).toBe('KEY_MISMATCH');
    expect(handedOut.partialSigs).toBe(0);
    expect(botwallet.actions()).toEqual(['signing_frost_init']);
    expect(statuses).toEqual(STATUSES.slice(0, 3));
    expectKeyMaterialWiped();
  });

  it('sends nothing for words that are not a Key 1', async () => {
    const outcome = await sign('these are not the twelve words of any key at all here');
    expect(outcome).toMatchObject({ ok: false, phase: 'prepare' });
    expect(botwallet.fetch).not.toHaveBeenCalled();
  });

  it('reports a failed submission at the complete phase, and drops the marker', async () => {
    botwallet.completeReply = async () => reply(202, {
      success: false,
      error: { code: 'SUBMISSION_UNCONFIRMED', message: "Your withdrawal was sent to Solana but isn't confirmed yet." },
    });
    const outcome = await sign();
    expect(outcome).toMatchObject({ ok: false, phase: 'complete' });
    expect(!outcome.ok && (outcome.error as ApiError).code).toBe('SUBMISSION_UNCONFIRMED');
    expect(botwallet.markedAtComplete).toBe(true);
    expect(wasSubmitting(INTENT_ID)).toBe(false);
    expectKeyMaterialWiped();
  });

  it('reports a reply that never came at the complete phase, and drops the marker', async () => {
    botwallet.completeReply = async () => { throw new TypeError('Failed to fetch'); };
    const outcome = await sign();
    expect(outcome).toMatchObject({ ok: false, phase: 'complete' });
    expect(!outcome.ok && (outcome.error as ApiError).code).toBe('NETWORK_ERROR');
    expect(wasSubmitting(INTENT_ID)).toBe(false);
    expectKeyMaterialWiped();
  });
});

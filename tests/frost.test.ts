// The browser FROST port must stay byte-compatible with the Go CLI and the server.
// frost-vectors.json is written by the Agent CLI's tests (packages/cli-go:
// go test ./solana/frost -run TestInteropVector -update) and copied here
// unchanged; see its "about".

import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { scalarFromEntropy, derivePublicShare, computePartialSig, generateNonce } from '../src/lib/frost';
import { mnemonicToScalar } from '../src/lib/mnemonic';
import { hexToBytes, bytesToHex, bytesToNumberLE, numberToBytes32LE } from './helpers';
import vectors from './frost-vectors.json';

const L = ed25519.CURVE.n;
const G = ed25519.ExtendedPoint.BASE;

// Go's Scalar.SetUniformBytes: a 64-byte little-endian number reduced mod L.
function uniformScalar(hex: string): Uint8Array {
  return numberToBytes32LE(bytesToNumberLE(hexToBytes(hex)) % L);
}

describe('FROST port matches the Go vectors', () => {
  it('derives the key share and public share from entropy', () => {
    const scalar = scalarFromEntropy(hexToBytes(vectors.scalar_from_entropy.entropy));
    expect(bytesToHex(scalar)).toBe(vectors.scalar_from_entropy.scalar);
    expect(bytesToHex(derivePublicShare(scalar))).toBe(vectors.scalar_from_entropy.public);
  });

  it('zeroes the entropy it was given', () => {
    const entropy = hexToBytes(vectors.scalar_from_entropy.entropy);
    scalarFromEntropy(entropy);
    expect(entropy.every(b => b === 0)).toBe(true);
  });

  it('bot and server shares add up to the group key', () => {
    const bot = scalarFromEntropy(hexToBytes(vectors.dkg.bot_entropy));
    const server = scalarFromEntropy(hexToBytes(vectors.dkg.server_entropy));
    expect(bytesToHex(bot)).toBe(vectors.dkg.bot_scalar);
    expect(bytesToHex(server)).toBe(vectors.dkg.server_scalar);
    expect(bytesToHex(derivePublicShare(bot))).toBe(vectors.dkg.bot_public);
    expect(bytesToHex(derivePublicShare(server))).toBe(vectors.dkg.server_public);

    const group = ed25519.ExtendedPoint.fromHex(vectors.dkg.bot_public)
      .add(ed25519.ExtendedPoint.fromHex(vectors.dkg.server_public));
    expect(bytesToHex(group.toRawBytes())).toBe(vectors.dkg.group_key);
  });

  it('computes the same partial signature as Go, and it aggregates to a valid Ed25519 signature', () => {
    const v = vectors.signing;
    const botNonce = uniformScalar(v.bot_nonce_bytes);
    const serverNonce = uniformScalar(v.server_nonce_bytes);
    expect(bytesToHex(G.multiply(bytesToNumberLE(botNonce)).toRawBytes())).toBe(v.bot_nonce_commitment);
    expect(bytesToHex(G.multiply(bytesToNumberLE(serverNonce)).toRawBytes())).toBe(v.server_nonce_commitment);

    const message = hexToBytes(v.message);
    const groupKey = hexToBytes(vectors.dkg.group_key);
    const botPartial = computePartialSig(
      botNonce,
      hexToBytes(v.bot_nonce_commitment),
      hexToBytes(v.server_nonce_commitment),
      groupKey,
      message,
      hexToBytes(vectors.dkg.bot_scalar),
    );
    expect(bytesToHex(botPartial)).toBe(v.bot_partial_sig);

    // The server's half, computed the same way from its side, must match Go too.
    const serverPartial = computePartialSig(
      serverNonce,
      hexToBytes(v.server_nonce_commitment),
      hexToBytes(v.bot_nonce_commitment),
      groupKey,
      message,
      hexToBytes(vectors.dkg.server_scalar),
    );
    expect(bytesToHex(serverPartial)).toBe(v.server_partial_sig);

    const z = (bytesToNumberLE(botPartial) + bytesToNumberLE(serverPartial)) % L;
    const signature = new Uint8Array([...hexToBytes(v.group_nonce), ...numberToBytes32LE(z)]);
    expect(bytesToHex(signature)).toBe(v.signature);
    expect(ed25519.verify(signature, message, groupKey)).toBe(true);
  });

  it('makes nonces whose commitment matches the secret', () => {
    const nonce = generateNonce();
    const secret = bytesToNumberLE(nonce.secret);
    expect(secret > 0n && secret < L).toBe(true);
    expect(bytesToHex(G.multiply(secret).toRawBytes())).toBe(bytesToHex(nonce.commitment));
    expect(bytesToHex(generateNonce().secret)).not.toBe(bytesToHex(nonce.secret));
  });
});

describe('Key 1 words', () => {
  it('turn into the same key share as the raw entropy', () => {
    const words = entropyToMnemonic(hexToBytes(vectors.scalar_from_entropy.entropy), wordlist);
    expect(words.split(' ')).toHaveLength(12);
    const scalar = mnemonicToScalar(`  ${words.toUpperCase()} `);
    expect(bytesToHex(scalar)).toBe(vectors.scalar_from_entropy.scalar);
    expect(bytesToHex(derivePublicShare(scalar))).toBe(vectors.scalar_from_entropy.public);
  });

  it('give the key share Go derives from the same words', () => {
    const scalar = mnemonicToScalar(vectors.key_share_from_mnemonic.mnemonic);
    expect(bytesToHex(scalar)).toBe(vectors.key_share_from_mnemonic.scalar);
    expect(bytesToHex(derivePublicShare(scalar))).toBe(vectors.key_share_from_mnemonic.public);
  });
});

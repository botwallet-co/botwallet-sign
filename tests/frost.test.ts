// The browser FROST port must stay byte-compatible with the Go CLI and the server.
// Vectors from packages/cli-go/solana/frost/interop_test.go (TestInteropVector), as
// recorded in packages/mcp/tests/unit/frost/interop.test.ts.

import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { scalarFromEntropy, derivePublicShare, computePartialSig, generateNonce } from '../src/lib/frost';
import { mnemonicToScalar, derivePublicShareFromScalar, toBase64, fromBase64 } from '../src/lib/mnemonic';
import { hexToBytes, bytesToHex } from './helpers';

const L = ed25519.CURVE.n;
const G = ed25519.ExtendedPoint.BASE;

const VECTORS = {
  scalarFromEntropy: {
    entropy: '000102030405060708090a0b0c0d0e0f',
    scalar: '39ca89f851f6dc15789dd9e73f8090622941c836cdb19a26ceeb91da35e27104',
    public: 'e9c8d075985daa3d89a45385dc29d83a97d70766d13d91459af58b73e21cc131',
  },
  dkg: {
    botEntropy: '00000000000000000000000000000000',
    botScalar: '5ae99b3b57464c9cde02cefe6f4b75fb8043a190624f4c9bf68e13151517a50e',
    botPublic: 'efa94430226c8000e6a26ddfc594047997316ab167bcbda22d5d01fc97c874f4',
    serverEntropy: '01010101010101010101010101010101',
    serverScalar: 'e3211b6c9a44c9509959b3a2e563b33c43a66f9ef587974cec20ddfd00f8d703',
    serverPublic: 'c8f34d287c3437175884ebb28bc5896e3ac27bbc609ef24183c091d5c8a4e819',
    groupKey: 'd2266eb8bdd22952ad3d11d4b42ab1e62abdefc770389ed7eda1f05097ee69d1',
  },
  signing: {
    message: '74657374206d65737361676520666f7220696e7465726f70',
    botNonceBytes: 'aabbccdd'.repeat(16),
    serverNonceBytes: '11223344'.repeat(16),
    botNonceCommit: '03ec3f74a72b0685c2296330b0d9dacf9f93b23c27ffd7449b8d5584c9f32a7c',
    serverNonceCommit: '707b968e4bbbe9eb1aeba34b79d86f7de5c49e1de87825b8efeadbbd99141f71',
    groupNonce: 'a8ecf899375896f5e27e1bf17cf8b7bdf91e7a3add63d2f270f2c93941920b32',
    botPartialSig: 'be8b0a7819cd46bbad5d3bbf3abaf2bcf160de14c913c32883a4e2a779edb501',
    serverPartial: '5594d637bd4959e2cf8484fbd4d276dfea65c64b9f3751f677c13879133e5b0e',
    finalSignature: 'a8ecf899375896f5e27e1bf17cf8b7bdf91e7a3add63d2f270f2c93941920b32264ceb52bcb38d45a745c81731938a87dcc6a460684b141ffb651b218d2b1100',
  },
} as const;

function bytesToNumberLE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) + BigInt(bytes[i]);
  return n;
}

function numberToBytes32LE(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

// Go's Scalar.SetUniformBytes: a 64-byte little-endian number reduced mod L.
function uniformScalar(hex: string): Uint8Array {
  return numberToBytes32LE(bytesToNumberLE(hexToBytes(hex)) % L);
}

describe('FROST port matches the Go vectors', () => {
  it('derives the key share and public share from entropy', () => {
    const scalar = scalarFromEntropy(hexToBytes(VECTORS.scalarFromEntropy.entropy));
    expect(bytesToHex(scalar)).toBe(VECTORS.scalarFromEntropy.scalar);
    expect(bytesToHex(derivePublicShare(scalar))).toBe(VECTORS.scalarFromEntropy.public);
  });

  it('zeroes the entropy it was given', () => {
    const entropy = hexToBytes(VECTORS.scalarFromEntropy.entropy);
    scalarFromEntropy(entropy);
    expect(entropy.every(b => b === 0)).toBe(true);
  });

  it('bot and server shares add up to the group key', () => {
    const bot = scalarFromEntropy(hexToBytes(VECTORS.dkg.botEntropy));
    const server = scalarFromEntropy(hexToBytes(VECTORS.dkg.serverEntropy));
    expect(bytesToHex(bot)).toBe(VECTORS.dkg.botScalar);
    expect(bytesToHex(server)).toBe(VECTORS.dkg.serverScalar);
    expect(bytesToHex(derivePublicShare(bot))).toBe(VECTORS.dkg.botPublic);
    expect(bytesToHex(derivePublicShare(server))).toBe(VECTORS.dkg.serverPublic);

    const group = ed25519.ExtendedPoint.fromHex(VECTORS.dkg.botPublic)
      .add(ed25519.ExtendedPoint.fromHex(VECTORS.dkg.serverPublic));
    expect(bytesToHex(group.toRawBytes())).toBe(VECTORS.dkg.groupKey);
  });

  it('computes the same partial signature as Go, and it aggregates to a valid Ed25519 signature', () => {
    const v = VECTORS.signing;
    const botNonce = uniformScalar(v.botNonceBytes);
    const serverNonce = uniformScalar(v.serverNonceBytes);
    expect(bytesToHex(G.multiply(bytesToNumberLE(botNonce)).toRawBytes())).toBe(v.botNonceCommit);
    expect(bytesToHex(G.multiply(bytesToNumberLE(serverNonce)).toRawBytes())).toBe(v.serverNonceCommit);

    const message = hexToBytes(v.message);
    const groupKey = hexToBytes(VECTORS.dkg.groupKey);
    const botPartial = computePartialSig(
      botNonce,
      hexToBytes(v.botNonceCommit),
      hexToBytes(v.serverNonceCommit),
      groupKey,
      message,
      hexToBytes(VECTORS.dkg.botScalar),
    );
    expect(bytesToHex(botPartial)).toBe(v.botPartialSig);

    // The server's half, computed the same way from its side, must match Go too.
    const serverPartial = computePartialSig(
      serverNonce,
      hexToBytes(v.serverNonceCommit),
      hexToBytes(v.botNonceCommit),
      groupKey,
      message,
      hexToBytes(VECTORS.dkg.serverScalar),
    );
    expect(bytesToHex(serverPartial)).toBe(v.serverPartial);

    const z = (bytesToNumberLE(botPartial) + bytesToNumberLE(serverPartial)) % L;
    const signature = new Uint8Array([...hexToBytes(v.groupNonce), ...numberToBytes32LE(z)]);
    expect(bytesToHex(signature)).toBe(v.finalSignature);
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
    const words = entropyToMnemonic(hexToBytes(VECTORS.scalarFromEntropy.entropy), wordlist);
    expect(words.split(' ')).toHaveLength(12);
    const scalar = mnemonicToScalar(`  ${words.toUpperCase()} `);
    expect(bytesToHex(scalar)).toBe(VECTORS.scalarFromEntropy.scalar);
    expect(bytesToHex(derivePublicShareFromScalar(scalar))).toBe(VECTORS.scalarFromEntropy.public);
  });

  it('base64 round-trips', () => {
    const bytes = hexToBytes(VECTORS.signing.finalSignature);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

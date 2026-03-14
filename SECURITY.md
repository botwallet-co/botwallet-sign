# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the BotWallet Signer, please report it responsibly.

**Email:** security@botwallet.co

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and provide an estimated timeline for a fix. We will not take legal action against security researchers who follow responsible disclosure practices.

## Scope

This policy covers:
- The signing portal source code (`src/lib/frost.ts`, `src/lib/mnemonic.ts`, `src/lib/api.ts`, `src/lib/fragment.ts`)
- The React UI components (`src/components/`)
- The FROST partial signature computation and nonce generation logic
- Memory zeroing of key material after use
- URL fragment parsing and `returnUrl` validation

## Out of Scope

- Vulnerabilities in third-party dependencies (@noble/curves, @scure/bip39, etc.) — please report these to their respective maintainers
- Social engineering or phishing attacks that trick users into entering mnemonics on fake sites
- Malware on the user's machine (keyloggers, screen capture)
- Server-side edge function logic (report separately to security@botwallet.co with "server-side" in the subject)
- Issues with Solana's RPC endpoints or blockchain

## Cryptographic Design Decisions

The following are intentional design choices, not vulnerabilities:

- **Raw scalar signing** — The tool signs using a raw Ed25519 scalar rather than a standard seed. This is necessary because FROST key shares produce unclamped scalars that cannot be represented as standard Ed25519 seeds.
- **Client-side nonce generation** — FROST nonces are generated in the browser using `crypto.getRandomValues()` and immediately zeroed after use. Only the nonce commitment (public point) is sent to the server.
- **Partial signatures only** — The browser computes a FROST partial signature. The full signing key is never reconstructed in any single location (browser or server).
- **Memory zeroing** — All sensitive `Uint8Array` buffers (scalars, nonces, entropy, digests) are overwritten with zeros immediately after use via `zeroMemory()`.
- **URL fragment for session data** — Transaction parameters (`intentId`, `signing_token`, `returnUrl`) are passed via URL fragments (`#`), which are never sent to the server in HTTP requests. The fragment is cleared from browser history immediately after parsing.
- **`returnUrl` allowlist** — The `returnUrl` parameter is validated against a strict origin allowlist to prevent open redirect attacks.

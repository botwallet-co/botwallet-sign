# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Botwallet Signer, please report it responsibly.

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
- Memory zeroing of `Uint8Array` key buffers after use
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
- **Client-side nonce generation** — FROST nonces are generated in the browser using `crypto.getRandomValues()`, and their byte buffers are zeroed right after use. BigInt copies of the nonce made during the signing math cannot be zeroed. Only the nonce commitment (public point) is sent to the server.
- **Partial signatures only** — The browser computes a FROST partial signature. The full signing key is never reconstructed in any single location (browser or server).
- **Key 1 only** — The page accepts exactly the 12 words of Key 1. A pasted 24-word backup (Key 1 and Key 2, which together are the full key) is refused, not trimmed, so owners are never asked to put Key 2 into this page. After words are pasted, the page tries to empty the clipboard and tells the owner whether that worked; clipboard history and sync keep their own copy, which only the owner can delete.
- **Memory zeroing** — All sensitive `Uint8Array` buffers (scalars, nonces, entropy, digests) are overwritten with zeros immediately after use via `zeroMemory()`. JavaScript strings and BigInts cannot be wiped: the 12 words (in input fields, React state and the joined phrase) and the BigInt values used in the signing math stay in the tab's memory until garbage collection. Owners should close the tab after signing.
- **URL fragment for session data** — Transaction parameters (`intentId`, `signing_token`, `returnUrl`) are passed via URL fragments (`#`), which are never sent to the server in HTTP requests. The fragment is cleared from browser history immediately after parsing. So that a page refresh does not lose the session, the parsed parameters are kept in `sessionStorage` (this tab only, cleared when the tab closes) and removed after success, on cancel, or when the server reports the session expired or used. Key 1 is never stored.
- **`returnUrl` allowlist** — The `returnUrl` parameter is validated against a strict origin allowlist to prevent open redirect attacks.

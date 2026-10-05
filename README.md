# Botwallet Signer

Browser-based FROST threshold signing portal for [Botwallet](https://botwallet.co). Authorizes withdrawals and transfers initiated from the Botwallet dashboard using Key 1, the 12 words your agent keeps.

**Your private key never leaves the browser.** This app performs client-side FROST partial signature computation and communicates only the partial signature to the server. The full signing key is never reconstructed.

**Live:** [sign.botwallet.co](https://sign.botwallet.co)

## How it works

1. You initiate a withdrawal or transfer from the [Botwallet dashboard](https://app.botwallet.co).
2. The dashboard creates a signing intent on the server and redirects you here with a one-time token.
3. You review the transaction details (amount, from, to, fees).
4. You enter Key 1 (the 12 words your agent keeps) — this is processed **entirely in your browser**.
5. The app computes a FROST nonce commitment, checks that the transaction the server prepared matches what you reviewed, then computes the partial signature and sends only those to the server.
6. The server computes its own partial signature using Key 2, aggregates both, and submits the transaction to Solana.

At no point does the full private key exist in any single location.

## Self-hosting

You can clone and run this yourself to verify the code or host your own instance:

```bash
git clone https://github.com/botwallet-co/botwallet-sign.git
cd botwallet-sign
npm install
npm run dev
```

The dashboard has a hidden option to specify a custom signing portal URL if you're self-hosting.

"Return to Dashboard" goes back only to `https://app.botwallet.co`. The dev server (`npm run dev`) also accepts a dashboard running locally on `http://localhost:5173` or `http://localhost:5174`; production builds don't, so test a local dashboard against a local copy of this page.

### Build for production

```bash
npm run build
```

Output is in `dist/` — serve it from any static hosting (S3, Netlify, Vercel, GitHub Pages, etc.).

### Tests

```bash
npm test
```

Runs everything in `tests/`, including the transaction checks and the FROST test vectors. `npm ci` installs the exact versions in `package-lock.json`.

## Security

- **No server-side key access.** Key 1 is processed client-side using `@noble/hashes` and `@noble/curves` — audited, pure-JS cryptography libraries.
- **Checks before signing.** Before Key 1 signs, the page decodes the Solana transaction the server prepared and refuses to sign unless it sends exactly the reviewed amount to the recipient's associated USDC account (the standard one Solana wallets use), plus at most the reviewed fee, and does nothing else with the wallet. See `src/lib/verify-transaction.ts`; the Botwallet Agent CLI and MCP server apply the same rules, and all three run the same test vectors (`tests/txcheck-vectors.json`).
- **Memory zeroing.** `Uint8Array` copies of key material (scalar, nonce, entropy) are zeroed right after use. The 12 words and BigInt intermediates are JavaScript values that cannot be wiped, so they stay in this tab's memory until garbage collection. Close the tab after signing.
- **Single-use tokens.** Each signing session uses a cryptographically random token that expires in 15 minutes and can complete only one transaction. If a signing round times out before anything is submitted, the same link can be used to try again until it expires.
- **No inline scripts.** CSP policy is `script-src 'self'` — no third-party scripts, no inline execution.
- **Open source.** Inspect every line of code. The FROST signing logic is in `src/lib/frost.ts` and `src/lib/mnemonic.ts`.

## Tech stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- `@noble/hashes` / `@noble/curves` for cryptography
- `@scure/bip39` for mnemonic validation

## License

Apache License 2.0 — see [LICENSE](LICENSE).

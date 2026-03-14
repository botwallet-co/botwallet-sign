# BotWallet Signer

Browser-based FROST threshold signing portal for [BotWallet](https://botwallet.co). Authorizes withdrawals and transfers initiated from the BotWallet dashboard using your recovery phrase (Key 1 / S1).

**Your private key never leaves the browser.** This app performs client-side FROST partial signature computation and communicates only the partial signature to the server. The full signing key is never reconstructed.

**Live:** [sign.botwallet.co](https://sign.botwallet.co)

## How it works

1. You initiate a withdrawal or transfer from the [BotWallet dashboard](https://app.botwallet.co).
2. The dashboard creates a signing intent on the server and redirects you here with a one-time token.
3. You review the transaction details (amount, from, to, fees).
4. You enter your 12-word recovery phrase (Key 1 / S1) — this is processed **entirely in your browser**.
5. The app computes a FROST nonce commitment and partial signature, sends only those to the server.
6. The server computes its own partial signature using Key 2 (S2), aggregates both, and submits the transaction to Solana.

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

### Build for production

```bash
npm run build
```

Output is in `dist/` — serve it from any static hosting (S3, Netlify, Vercel, GitHub Pages, etc.).

## Security

- **No server-side key access.** The recovery phrase is processed client-side using `@noble/hashes` and `@noble/curves` — audited, pure-JS cryptography libraries.
- **Memory zeroing.** Key material is overwritten in memory immediately after use.
- **Single-use tokens.** Each signing session uses a cryptographically random token that expires in 15 minutes and can only be used once.
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

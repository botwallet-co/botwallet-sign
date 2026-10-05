import { describe, it, expect } from 'vitest';
import type { SigningIntentDetails } from '../src/lib/api';
import { base58Decode, base58Encode } from '../src/lib/base58';
import {
  associatedTokenAddress, parseLegacyMessage, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID,
  type LegacyMessage,
} from '../src/lib/solana';
import {
  verifyTransaction, verifyIntentMatchesRequest, usdcToCents, TransactionMismatchError,
} from '../src/lib/verify-transaction';
import {
  key, ata, buildServerMessage, encodeMessage, USDC_MAINNET, type ServerBuild,
} from './helpers';

const feePayer = key('fee-payer');
const wallet = key('wallet');
const recipient = key('recipient');
const feeOwner = key('fee-collector');
const attacker = key('attacker');

function details(overrides: Partial<SigningIntentDetails> = {}): SigningIntentDetails {
  return {
    amount: '12.34',
    fee_usdc: '1.25',
    fee_breakdown: { platform_fee_usdc: '1.25', account_setup_fee_usdc: '0.00' },
    from_address: base58Encode(wallet),
    from_name: 'Research agent',
    to_address: base58Encode(recipient),
    to_name: null,
    network: 'mainnet-beta',
    action_type: 'withdraw',
    fee_covered_by: 'Botwallet',
    expires_at: '2026-10-04T12:15:00Z',
    ...overrides,
  };
}

function serverMessage(overrides: Partial<ServerBuild> = {}): Uint8Array {
  return buildServerMessage({
    feePayer,
    wallet,
    fromTokenAccount: associatedTokenAddress(wallet, USDC_MAINNET),
    toWallet: recipient,
    toTokenAccount: ata(recipient, true),
    feeCollection: { owner: feeOwner, account: ata(feeOwner, true) },
    amount: 12_340_000n,
    fee: 1_250_000n,
    ...overrides,
  });
}

function tamper(message: Uint8Array, change: (m: LegacyMessage) => void): Uint8Array {
  const parsed = parseLegacyMessage(message);
  change(parsed);
  return encodeMessage(parsed);
}

function addKey(m: LegacyMessage, k: Uint8Array): number {
  const found = m.accountKeys.findIndex(a => a.every((b, i) => b === k[i]));
  if (found >= 0) return found;
  m.accountKeys.push(k);
  return m.accountKeys.length - 1;
}

function expectRefused(d: SigningIntentDetails, message: Uint8Array, groupKey = wallet) {
  expect(() => verifyTransaction(d, groupKey, message)).toThrow(TransactionMismatchError);
}

describe('ATA derivation and base58', () => {
  // Expected values from @solana/spl-token getAssociatedTokenAddressSync for the same keys.
  it('matches the canonical USDC accounts', () => {
    expect(base58Encode(wallet)).toBe('GfsJWjmGXMfct8JMR9Lm9ySUnniZbnGUTQDbT8ipWf9U');
    expect(base58Encode(associatedTokenAddress(wallet, USDC_MAINNET))).toBe('53bjdfCnUSTrctVKjTnZf8FqriCRRuGYbWd7m56DAEAa');
    expect(base58Encode(associatedTokenAddress(recipient, USDC_MAINNET))).toBe('Cbaz6s2wbBKnQguE73H2VtGSsjX89W3Xa9cFRHkaKKJE');
    expect(base58Encode(associatedTokenAddress(feeOwner, USDC_MAINNET))).toBe('3VVmsLcqphWBqkgbT726QRsZxZtGMJFtsrqLUWnZ9Hp4');
  });

  it('round-trips addresses, including leading zero bytes', () => {
    expect(base58Decode(SYSTEM_PROGRAM_ID)).toEqual(new Uint8Array(32));
    expect(base58Encode(new Uint8Array(32))).toBe(SYSTEM_PROGRAM_ID);
    expect(base58Encode(base58Decode(TOKEN_PROGRAM_ID))).toBe(TOKEN_PROGRAM_ID);
    expect(() => base58Decode('0OIl')).toThrow();
  });
});

describe('verifyTransaction accepts what the server builds', () => {
  it('recipient and fee accounts already exist', () => {
    expect(() => verifyTransaction(details(), wallet, serverMessage())).not.toThrow();
  });

  it('recipient account is created in the same transaction', () => {
    // The fee leg carries the whole reviewed fee, here including account setup.
    const message = serverMessage({ toTokenAccount: ata(recipient, false), fee: 1_750_000n });
    expect(parseLegacyMessage(message).instructions).toHaveLength(3);
    expect(() => verifyTransaction(details({ fee_usdc: '1.75' }), wallet, message)).not.toThrow();
  });

  it('fee collection account is created in the same transaction', () => {
    const message = serverMessage({ feeCollection: { owner: feeOwner, account: ata(feeOwner, false) } });
    expect(() => verifyTransaction(details(), wallet, message)).not.toThrow();
  });

  it('both accounts are created', () => {
    const message = serverMessage({
      toTokenAccount: ata(recipient, false),
      feeCollection: { owner: feeOwner, account: ata(feeOwner, false) },
    });
    expect(parseLegacyMessage(message).instructions).toHaveLength(4);
    expect(() => verifyTransaction(details(), wallet, message)).not.toThrow();
  });

  it('no fee', () => {
    const message = serverMessage({ fee: 0n });
    expect(parseLegacyMessage(message).instructions).toHaveLength(1);
    expect(() => verifyTransaction(details({ fee_usdc: '0.00' }), wallet, message)).not.toThrow();
  });

  it('a fee is shown but the server collects none', () => {
    const message = serverMessage({ feeCollection: undefined });
    expect(() => verifyTransaction(details(), wallet, message)).not.toThrow();
  });

  it('a lower fee than reviewed, which only costs the wallet less', () => {
    expect(() => verifyTransaction(details(), wallet, serverMessage({ fee: 1_249_999n }))).not.toThrow();
  });

  it("the wallet's USDC sits in a token account other than its ATA", () => {
    const message = serverMessage({ fromTokenAccount: key('older-usdc-account') });
    expect(() => verifyTransaction(details(), wallet, message)).not.toThrow();
  });

  it('a transfer between wallets', () => {
    expect(() => verifyTransaction(details({ action_type: 'transfer' }), wallet, serverMessage())).not.toThrow();
  });

  it('devnet uses the devnet USDC mint', () => {
    const devnetMint = base58Decode('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    const message = serverMessage({
      mint: devnetMint,
      fromTokenAccount: associatedTokenAddress(wallet, devnetMint),
      toTokenAccount: ata(recipient, false, devnetMint),
      feeCollection: { owner: feeOwner, account: ata(feeOwner, true, devnetMint) },
    });
    expect(() => verifyTransaction(details({ network: 'devnet' }), wallet, message)).not.toThrow();
    expectRefused(details(), message);
  });

  it('a message built independently by @solana/web3.js (wallet as a read-only signer)', () => {
    const message = Uint8Array.from(atob(
      'AgEFCjIYJXv6ZiMVoCnjNfVOKfwrxOUepKfvKJgCpB1a3mbc6NRAUIc9uoZap8Fwq0zOZNkIOaNNz9bPcdFOAgVEOxslBCvARGtDcahrNK8XS7WGKxc9yDRyUaa1PHZizVxFCTwZLzHExj2w4qvnFQWT5Kbt/JJsE5yiU9SNXGzbaapHrEy6550bCkKS4fZYBquOcY06+9lKC/GzFppnOpMvXC8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGZdBpjbyPuVr8JcOk2c8oDYelhbeZkkPKYAj9AyWJdfjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FnG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpOVv3J/mqxegJEVkQc/z5yCb0KIBBMcoIm+ujhpQhdJoDBwYABAYIBQkBAQkDAwQBCQMgS7wAAAAAAAkDAwIBCQPQEhMAAAAAAA==',
    ), c => c.charCodeAt(0));
    expect(() => verifyTransaction(details(), wallet, message)).not.toThrow();
  });
});

describe('verifyTransaction refuses anything else', () => {
  it('group key is not the wallet', () => {
    expectRefused(details(), serverMessage(), key('other-wallet'));
  });

  it('a different amount, even by one base unit', () => {
    expectRefused(details(), serverMessage({ amount: 12_340_001n }));
    expectRefused(details(), serverMessage({ amount: 12_339_999n }));
  });

  it('a different recipient', () => {
    expectRefused(details(), serverMessage({ toWallet: attacker, toTokenAccount: ata(attacker, true) }));
    expectRefused(details(), serverMessage({ toWallet: attacker, toTokenAccount: ata(attacker, false) }));
  });

  // The page can't tell who owns a token account from the message alone, and the server pays
  // only into the recipient's canonical (associated) account, so any other one is refused.
  it("an existing token account that isn't the recipient's canonical one", () => {
    expectRefused(details(), serverMessage({ toTokenAccount: { address: key('some-token-account'), exists: true } }));
  });

  it('a higher fee, or a fee the review did not show', () => {
    expectRefused(details(), serverMessage({ fee: 1_250_001n }));
    expectRefused(details({ fee_usdc: '0.00' }), serverMessage());
  });

  it('a second fee transfer', () => {
    expectRefused(details(), tamper(serverMessage(), m => {
      m.instructions.push({ ...m.instructions[m.instructions.length - 1] });
    }));
  });

  it('the amount split across two transfers to the recipient', () => {
    expectRefused(details(), tamper(serverMessage({ fee: 0n, amount: 6_170_000n }), m => {
      m.instructions.push({ ...m.instructions[0] });
    }));
  });

  it('the fee paid from a different token account', () => {
    expectRefused(details(), tamper(serverMessage(), m => {
      const fee = m.instructions[m.instructions.length - 1];
      fee.accounts = [addKey(m, key('another-token-account')), fee.accounts[1], fee.accounts[2]];
    }));
  });

  it('a transfer authorized by the fee payer instead of the wallet', () => {
    expectRefused(details(), tamper(serverMessage(), m => {
      m.instructions[0].accounts[2] = 0;
    }));
  });

  for (const [name, data] of [
    ['Approve', [4, 0, 0, 0, 0, 0, 0, 0, 1]],
    ['SetAuthority', [6, 2, 1, ...attacker]],
    ['CloseAccount', [9]],
    ['TransferChecked', [12, 0, 0, 0, 0, 0, 0, 0, 1, 6]],
  ] as const) {
    it(`a token ${name} instruction alongside the transfer`, () => {
      expectRefused(details(), tamper(serverMessage(), m => {
        const tokenProgram = addKey(m, base58Decode(TOKEN_PROGRAM_ID));
        const fromToken = m.instructions[0].accounts[0];
        m.instructions.push({
          programIndex: tokenProgram,
          accounts: [fromToken, addKey(m, attacker), 1],
          data: Uint8Array.from(data),
        });
      }));
    });
  }

  it('a SOL transfer from the wallet', () => {
    expectRefused(details(), tamper(serverMessage(), m => {
      const data = new Uint8Array(12);
      data[0] = 2;
      new DataView(data.buffer).setBigUint64(4, 1_000_000n, true);
      m.instructions.push({ programIndex: addKey(m, base58Decode(SYSTEM_PROGRAM_ID)), accounts: [1, addKey(m, attacker)], data });
    }));
  });

  it('an instruction for any other program, even one that does not touch the wallet', () => {
    expectRefused(details(), tamper(serverMessage(), m => {
      m.instructions.push({ programIndex: addKey(m, key('memo-program')), accounts: [], data: new Uint8Array([1]) });
    }));
  });

  it('account setup paid by the wallet', () => {
    expectRefused(details(), tamper(serverMessage({ toTokenAccount: ata(recipient, false) }), m => {
      m.instructions[0].accounts[0] = 1;
    }));
  });

  it('an associated token account instruction other than create', () => {
    expectRefused(details(), tamper(serverMessage({ toTokenAccount: ata(recipient, false) }), m => {
      m.instructions[0].data = new Uint8Array([2]);
    }));
  });

  it('account setup for someone who receives nothing', () => {
    expectRefused(details(), tamper(serverMessage({ toTokenAccount: ata(recipient, false) }), m => {
      const create = m.instructions[0];
      const someone = key('someone');
      m.instructions.push({
        ...create,
        accounts: [0, addKey(m, associatedTokenAddress(someone, USDC_MAINNET)), addKey(m, someone), ...create.accounts.slice(3)],
      });
    }));
  });

  it('the wallet is not the second signer', () => {
    expectRefused(details(), serverMessage({ feePayer: wallet, wallet: feePayer }));
    expectRefused(details(), tamper(serverMessage(), m => { m.numRequiredSignatures = 3; }));
    expectRefused(details(), tamper(serverMessage(), m => { m.numRequiredSignatures = 1; m.numReadonlyUnsigned = 0; }));
  });

  it('an account listed twice', () => {
    expectRefused(details(), tamper(serverMessage(), m => { m.accountKeys.push(m.accountKeys[2]); }));
  });

  it('versioned, truncated or padded messages', () => {
    const message = serverMessage();
    expectRefused(details(), Uint8Array.from([0x80, ...message]));
    expectRefused(details(), message.slice(0, -1));
    expectRefused(details(), Uint8Array.from([...message, 0]));
    // Account count written in two bytes instead of one
    expectRefused(details(), Uint8Array.from([...message.slice(0, 3), message[3] | 0x80, 0, ...message.slice(4)]));
    expectRefused(details(), new Uint8Array(0));
  });

  it('an account index past the end of the list', () => {
    expectRefused(details(), tamper(serverMessage(), m => { m.instructions[0].accounts[1] = m.accountKeys.length; }));
  });

  it('details it cannot read', () => {
    expectRefused(details({ network: 'testnet' }), serverMessage());
    expectRefused(details({ amount: '12.345' }), serverMessage());
    expectRefused(details({ fee_usdc: 'free' }), serverMessage());
    expectRefused(details({ to_address: 'not-an-address' }), serverMessage());
    expectRefused(details({ amount: '0.00' }), serverMessage({ amount: 0n }));
  });
});

describe('verifyIntentMatchesRequest', () => {
  it('passes links without expected values (older dashboards)', () => {
    expect(() => verifyIntentMatchesRequest(details(), undefined)).not.toThrow();
  });

  it('passes when the details match what was entered', () => {
    expect(() => verifyIntentMatchesRequest(details(), {
      amountCents: 1234, toAddress: base58Encode(recipient),
    })).not.toThrow();
  });

  it('refuses a different amount or recipient', () => {
    expect(() => verifyIntentMatchesRequest(details(), { amountCents: 1235 })).toThrow(TransactionMismatchError);
    expect(() => verifyIntentMatchesRequest(details(), { toAddress: base58Encode(attacker) })).toThrow(TransactionMismatchError);
  });
});

describe('usdcToCents', () => {
  it.each([
    ['12.34', 1234n], ['0.10', 10n], ['5', 500n], ['1.5', 150n], ['1000000.00', 100000000n],
  ])('%s', (text, cents) => {
    expect(usdcToCents(text)).toBe(cents);
  });

  it.each(['1.234', '-1.00', '', '1e3', ' 1.00', '1.'])('rejects "%s"', text => {
    expect(usdcToCents(text)).toBeNull();
  });
});

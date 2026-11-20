// The requests the page sends, and what it makes of each kind of reply, including none at
// all. errors.ts decides from the code whether money may have moved, so a missing or broken
// reply must never come back as a known answer.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiError, getSigningIntent, signingFrostInit, signingFrostComplete } from '../src/lib/api';

function stubFetch(reply: () => Promise<Response>) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => reply());
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function errorOf(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(() => null, e => e);
  expect(error).toBeInstanceOf(ApiError);
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requests', () => {
  it('posts each action to the public function with the fields the server reads', async () => {
    const fetch = stubFetch(async () => jsonReply(200, { success: true, data: { ok: true } }));

    await getSigningIntent('intent-1', 'token-1');
    await signingFrostInit('intent-1', 'token-1', 'COMMITMENT', 'PUBLIC_SHARE');
    await signingFrostComplete('intent-1', 'token-1', 'session-1', 'PARTIAL_SIG');

    for (const [url, init] of fetch.mock.calls) {
      expect(url).toMatch(/\/functions\/v1\/public$/);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    }
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body as string))).toEqual([
      { action: 'get_signing_intent', data: { intent_id: 'intent-1', signing_token: 'token-1' } },
      {
        action: 'signing_frost_init',
        data: { intent_id: 'intent-1', signing_token: 'token-1', nonce_commitment: 'COMMITMENT', agent_public_share: 'PUBLIC_SHARE' },
      },
      {
        action: 'signing_frost_complete',
        data: { intent_id: 'intent-1', signing_token: 'token-1', session_id: 'session-1', partial_sig: 'PARTIAL_SIG' },
      },
    ]);
  });

  it('returns the data of a successful reply', async () => {
    stubFetch(async () => jsonReply(200, { success: true, data: { amount: '12.00' } }));
    expect(await getSigningIntent('intent-1', 'token-1')).toEqual({ amount: '12.00' });
  });
});

describe('error replies', () => {
  it("keep the server's code and message, and its other fields as details", async () => {
    stubFetch(async () => jsonReply(409, {
      success: false,
      error: { code: 'INTENT_COMPLETED', message: 'This signing session is already completed', intent_status: 'completed' },
    }));
    const error = await errorOf(getSigningIntent('intent-1', 'token-1'));
    expect(error.code).toBe('INTENT_COMPLETED');
    expect(error.message).toBe('This signing session is already completed');
    expect(error.details).toEqual({ intent_status: 'completed' });
  });

  it('are UNKNOWN when they carry no usable code', async () => {
    for (const body of [
      { success: false },
      { success: false, error: { message: 'Something broke' } },
      { success: false, error: { code: '', message: '' } },
      { success: false, error: { code: 42 } },
      { success: true },
    ]) {
      stubFetch(async () => jsonReply(500, body));
      const error = await errorOf(signingFrostComplete('intent-1', 'token-1', 'session-1', 'PARTIAL_SIG'));
      expect(error.code, JSON.stringify(body)).toBe('UNKNOWN');
    }
  });

  it('keep a message that came without a code', async () => {
    stubFetch(async () => jsonReply(500, { success: false, error: { message: 'Something broke' } }));
    expect((await errorOf(getSigningIntent('intent-1', 'token-1'))).message).toBe('Something broke');
  });
});

describe('no usable reply', () => {
  it('is NETWORK_ERROR when the request never got an answer', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    const error = await errorOf(signingFrostComplete('intent-1', 'token-1', 'session-1', 'PARTIAL_SIG'));
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toMatch(/Unable to reach the server/);
  });

  it('is PARSE_ERROR, with the status, when the answer is not JSON', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await errorOf(signingFrostInit('intent-1', 'token-1', 'COMMITMENT', 'PUBLIC_SHARE'));
    expect(error.code).toBe('PARSE_ERROR');
    expect(error.message).toMatch(/502/);
  });
});

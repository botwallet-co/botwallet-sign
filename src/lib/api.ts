const API_URL = import.meta.env.VITE_API_URL || 'https://bcxqqwllnubdqiqoivqb.supabase.co/functions/v1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; [key: string]: unknown };
}

async function post<T>(action: string, data: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
    });
  } catch (e) {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your internet connection and try again.');
  }

  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('PARSE_ERROR', `Server returned status ${res.status}. Please try again.`);
  }

  if (!json.success || !json.data) {
    const { code, message, ...details }: Record<string, unknown> = json.error ?? {};
    throw new ApiError(
      typeof code === 'string' && code ? code : 'UNKNOWN',
      typeof message === 'string' && message ? message : 'Unknown error',
      details,
    );
  }
  return json.data;
}

export class ApiError extends Error {
  code: string;
  /** The error's other fields, such as intent_status or solana_signature. */
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

export interface SigningIntentDetails {
  amount: string;
  fee_usdc: string;
  fee_breakdown?: {
    platform_fee_usdc: string;
    account_setup_fee_usdc: string;
  };
  from_address: string;
  from_name: string;
  to_address: string;
  to_name: string | null;
  network: string;
  action_type: string;
  fee_covered_by: string;
  expires_at: string;
  /**
   * What an unfinished signing attempt with this link is doing. Only newer servers send it,
   * and only while one is under way:
   *   submitting   the transaction was handed over for sending and may have gone through
   *   in_progress  an attempt started moments ago and nothing was sent; it can be retried after retry_after
   *   stale        an earlier attempt sent nothing, and the link can be signed again
   */
  signing_state?: 'submitting' | 'in_progress' | 'stale';
  retry_after?: string;
}

export interface FrostInitResult {
  session_id: string;
  server_nonce_commitment: string;
  group_key: string;
  message_to_sign: string;
  fee_details: {
    platform_fee_usdc: string;
    network_fees: string;
    ata_creation: string;
  };
}

export interface FrostCompleteResult {
  solana_signature: string;
  /** Not used for links: the page builds the explorer link from solana_signature. */
  explorer_url: string;
  transaction_id: string;
  amount_usdc: string;
  fee_usdc: string;
  new_balance_usdc: string;
}

export async function getSigningIntent(intentId: string, token: string): Promise<SigningIntentDetails> {
  return post<SigningIntentDetails>('get_signing_intent', { intent_id: intentId, signing_token: token });
}

export async function signingFrostInit(
  intentId: string,
  token: string,
  nonceCommitment: string,
  agentPublicShare?: string,
): Promise<FrostInitResult> {
  return post<FrostInitResult>('signing_frost_init', {
    intent_id: intentId,
    signing_token: token,
    nonce_commitment: nonceCommitment,
    agent_public_share: agentPublicShare,
  });
}

export async function signingFrostComplete(
  intentId: string,
  token: string,
  sessionId: string,
  partialSig: string,
): Promise<FrostCompleteResult> {
  return post<FrostCompleteResult>('signing_frost_complete', {
    intent_id: intentId,
    signing_token: token,
    session_id: sessionId,
    partial_sig: partialSig,
  });
}

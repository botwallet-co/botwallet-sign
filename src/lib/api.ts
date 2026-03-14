const API_URL = import.meta.env.VITE_API_URL || 'https://bcxqqwllnubdqiqoivqb.supabase.co/functions/v1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
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
    throw new ApiError(json.error?.code || 'UNKNOWN', json.error?.message || 'Unknown error');
  }
  return json.data;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }

  get isRetryable(): boolean {
    return ['SESSION_EXPIRED', 'TRANSACTION_FAILED', 'BALANCE_CHECK_FAILED'].includes(this.code);
  }

  get isExpired(): boolean {
    return ['INTENT_EXPIRED', 'INTENT_COMPLETED'].includes(this.code);
  }
}

export interface SigningIntentDetails {
  amount: string;
  fee_usdc: string;
  from_address: string;
  from_name: string;
  to_address: string;
  to_name: string | null;
  network: string;
  action_type: string;
  fee_covered_by: string;
  expires_at: string;
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

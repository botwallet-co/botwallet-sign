// The signing link's payload: what the dashboard puts after the # as base64 JSON.
// The dashboard builds it with this type (apps/dashboard/src/lib/signer-url.ts,
// buildSigningLink) and signing-request.ts reads it by these field names, so renaming
// a field breaks both builds instead of silently dropping the check of `expected`.

export interface SigningLinkPayload {
  intentId: string;
  token: string;
  /** Where "Return to Dashboard" goes; a URL whose origin isn't allowed is replaced */
  returnUrl: string;
  /** What the owner entered in the dashboard; signing stops if the server's details differ */
  expected: {
    /** Cents of the amount sent to create_signing_intent, rounded the way the server rounds it */
    amountCents: number;
    /** Exactly the `to` address sent to create_signing_intent */
    toAddress: string;
  };
}

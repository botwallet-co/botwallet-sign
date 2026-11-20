/** What the owner is signing, in the page's words. */
export type ActionKind = 'withdrawal' | 'transfer';

/** The server's action_type ('withdraw' or 'transfer'). Anything else, or none yet, reads as a withdrawal. */
export function kindOf(actionType: string | undefined): ActionKind {
  return actionType === 'transfer' ? 'transfer' : 'withdrawal';
}

/** "Withdrawal" or "Transfer", for titles. */
export function kindTitle(kind: ActionKind): string {
  return kind === 'transfer' ? 'Transfer' : 'Withdrawal';
}

import type { ActionType, ScopedAuthorization } from "./types";

type Constraint = {
  agentId: string;
  action: ActionType;
  target: string;
  token: string;
  amount: string;
  nonce: string;
};

/** An approval covers one action. Every field has to match. */
export function authorizationMatches(
  authorization: ScopedAuthorization,
  action: Constraint,
): boolean {
  return (
    authorization.agentId === action.agentId &&
    authorization.action === action.action &&
    authorization.target.toLowerCase() === action.target.toLowerCase() &&
    authorization.token.toLowerCase() === action.token.toLowerCase() &&
    BigInt(authorization.amount) === BigInt(action.amount) &&
    authorization.nonce === action.nonce
  );
}

export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

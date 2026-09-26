export const actionTypes = [
  "API_CALL",
  "X402_PAYMENT",
  "TOKEN_TRANSFER",
  "SWAP",
  "CONTRACT_CALL",
] as const;

export type ActionType = (typeof actionTypes)[number];

export type Decision = "ALLOW" | "BLOCK" | "HUMAN_APPROVAL";

export type ActionStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "REJECTED"
  | "EXPIRED";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type Agent = {
  id: string;
  name: string;
  createdAt: string;
};

export type Policy = {
  agentId: string;
  /** USDC base units (6 decimals). Inclusive. */
  autonomousLimit: string;
  /** USDC base units. Amounts above this are blocked. */
  hardLimit: string;
  /** USDC base units. Null means no daily cap. */
  dailyLimit: string | null;
  allowedActions: ActionType[];
  allowedTokens: string[];
  /** Empty means any target. */
  allowedTargets: string[];
  updatedAt: string;
};

/** Constraints for one action. Not a standing permission. */
export type ScopedAuthorization = {
  agentId: string;
  action: ActionType;
  target: string;
  token: string;
  amount: string;
  nonce: string;
  expiresAt: string;
};

export type ActionRequest = {
  id: string;
  agentId: string;
  action: ActionType;
  target: string;
  token: string;
  /** USDC base units. */
  amount: string;
  nonce: string;
  note: string | null;
  status: ActionStatus;
  decision: Decision;
  reasons: string[];
  approvalRequestId: string | null;
  executionId: string | null;
  createdAt: string;
};

export type ApprovalRequest = {
  id: string;
  agentId: string;
  actionRequestId: string;
  action: ActionType;
  amount: string;
  token: string;
  target: string;
  reason: string;
  status: ApprovalStatus;
  expiresAt: string;
  createdAt: string;
  nonce: string;
  authorization: ScopedAuthorization;
};

/** Phase 1 does not sign. `signed` stays false on purpose. */
export type SimulatedExecution = {
  id: string;
  actionRequestId: string;
  executedAt: string;
  signed: false;
};

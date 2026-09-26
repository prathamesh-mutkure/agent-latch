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
  | "CANCELLED"
  | "FAILED";

export type Agent = {
  id: string;
  name: string;
  /**
   * Owner's ENS label. The agent id is `name.username.<parent>`. Null for
   * agents created before the owner set one, which keep `name.<parent>`.
   */
  username: string | null;
  /** Address the agent signs requests with. Written as the name's ETH record. */
  authAddress: string | null;
  /** Owner who approves this agent's exceptional actions. Null only for agents made before owner accounts. */
  userId: string | null;
  /** Whether an agent key has been issued. The key itself is never on this object. */
  hasKey: boolean;
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
  /** What a paid x402 resource returned, for the agent to read. */
  result: unknown;
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
  /** Set when status is FAILED, for example BINDING. */
  failureReason: string | null;
  /** World App wallet that signed the approve or deny. */
  decidedBy: string | null;
  decidedAt: string | null;
  /** Latest World ID for Agents check for this approval, if one started. */
  worldIdStatus: WorldIdCheckStatus | null;
  /** Why the latest World ID check did not approve, when it failed. */
  worldIdError: string | null;
  authorization: ScopedAuthorization;
};

/**
 * A World ID for Agents device check started by the owner's Approve. Only
 * VERIFIED lets the action run.
 */
export type WorldIdCheckStatus =
  | "WAITING"
  | "VERIFIED"
  | "DENIED"
  | "EXPIRED"
  | "FAILED"
  | "CANCELLED";

/** A broadcast sets `signed`. API_CALL and CONTRACT_CALL stay unsigned. */
export type SimulatedExecution = {
  id: string;
  actionRequestId: string;
  executedAt: string;
  signed: boolean;
};

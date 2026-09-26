import type {
  ActionType,
  ApprovalRequest,
  ApprovalStatus,
} from "@agentlatch/core";
import { formatUsdc } from "@agentlatch/core";
import type { approvals } from "./schema";

type ApprovalRow = typeof approvals.$inferSelect;

export function toApproval(row: ApprovalRow): ApprovalRequest {
  const expiresAt = row.expiresAt.toISOString();
  return {
    id: row.id,
    agentId: row.agentId,
    actionRequestId: row.actionRequestId,
    action: row.action as ActionType,
    amount: row.amount,
    token: row.token,
    target: row.target,
    reason: row.reason,
    status: row.status as ApprovalStatus,
    expiresAt,
    createdAt: row.createdAt.toISOString(),
    nonce: row.nonce,
    failureReason: row.failureReason,
    authorization: {
      agentId: row.agentId,
      action: row.action as ActionType,
      target: row.target,
      token: row.token,
      amount: row.amount,
      nonce: row.nonce,
      expiresAt,
    },
  };
}

export type AuthorizationDto = {
  agentId: string;
  action: ActionType;
  target: string;
  token: string;
  amount: string;
  amountUsdc: string;
  nonce: string;
  expiresAt: string;
};

export type ApprovalDto = {
  id: string;
  agentId: string;
  actionRequestId: string;
  action: ActionType;
  target: string;
  token: string;
  amountBaseUnits: string;
  amountUsdc: string;
  reason: string;
  status: ApprovalStatus;
  expiresAt: string;
  createdAt: string;
  nonce: string;
  failureReason: string | null;
  authorization: AuthorizationDto;
};

export function toApprovalDto(approval: ApprovalRequest): ApprovalDto {
  return {
    id: approval.id,
    agentId: approval.agentId,
    actionRequestId: approval.actionRequestId,
    action: approval.action,
    target: approval.target,
    token: approval.token,
    amountBaseUnits: approval.amount,
    amountUsdc: formatUsdc(approval.amount),
    reason: approval.reason,
    status: approval.status,
    expiresAt: approval.expiresAt,
    createdAt: approval.createdAt,
    nonce: approval.nonce,
    failureReason: approval.failureReason,
    authorization: {
      ...approval.authorization,
      amountUsdc: formatUsdc(approval.authorization.amount),
    },
  };
}

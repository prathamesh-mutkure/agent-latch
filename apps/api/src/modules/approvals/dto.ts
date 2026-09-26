import type {
  ActionType,
  ApprovalRequest,
  ApprovalStatus,
} from "@agentlatch/core";
import { formatUsdc } from "@agentlatch/core";

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
    authorization: {
      ...approval.authorization,
      amountUsdc: formatUsdc(approval.authorization.amount),
    },
  };
}

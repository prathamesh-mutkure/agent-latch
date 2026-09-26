import type {
  ActionRequest,
  ActionStatus,
  ActionType,
  Decision,
  SimulatedExecution,
} from "@agentlatch/core";
import { formatUsdc } from "@agentlatch/core";
import { getExecution } from "../../executor";

export type ActionDto = {
  id: string;
  agentId: string;
  action: ActionType;
  target: string;
  token: string;
  amountBaseUnits: string;
  amountUsdc: string;
  nonce: string;
  note: string | null;
  status: ActionStatus;
  decision: Decision;
  reasons: string[];
  approvalRequestId: string | null;
  execution: SimulatedExecution | null;
  createdAt: string;
};

export function toActionDto(action: ActionRequest): ActionDto {
  return {
    id: action.id,
    agentId: action.agentId,
    action: action.action,
    target: action.target,
    token: action.token,
    amountBaseUnits: action.amount,
    amountUsdc: formatUsdc(action.amount),
    nonce: action.nonce,
    note: action.note,
    status: action.status,
    decision: action.decision,
    reasons: action.reasons,
    approvalRequestId: action.approvalRequestId,
    execution: action.executionId
      ? (getExecution(action.executionId) ?? null)
      : null,
    createdAt: action.createdAt,
  };
}

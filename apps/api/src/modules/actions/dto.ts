import type {
  ActionRequest,
  ActionStatus,
  ActionType,
  Decision,
  SimulatedExecution,
} from "@agentlatch/core";
import { formatUsdc } from "@agentlatch/core";
import { getExecution } from "../../executor";
import type { actions } from "./schema";

type ActionRow = typeof actions.$inferSelect;

export function toAction(row: ActionRow): ActionRequest {
  return {
    id: row.id,
    agentId: row.agentId,
    action: row.action as ActionType,
    target: row.target,
    token: row.token,
    amount: row.amount,
    nonce: row.nonce,
    note: row.note,
    status: row.status as ActionStatus,
    decision: row.decision as Decision,
    reasons: row.reasons,
    approvalRequestId: row.approvalRequestId,
    executionId: row.executionId,
    result: row.result ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

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
  /** What the paid x402 resource returned. */
  result: unknown;
  createdAt: string;
};

export async function toActionDto(action: ActionRequest): Promise<ActionDto> {
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
      ? ((await getExecution(action.executionId)) ?? null)
      : null,
    result: action.result ?? null,
    createdAt: action.createdAt,
  };
}

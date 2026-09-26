import {
  type ActionRequest,
  type ActionType,
  evaluatePolicy,
  formatUsdc,
  parseUsdc,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "@agentlatch/core";
import { saveExecution } from "../../executor";
import { memory } from "../../memory";
import type { Failure, Success } from "../../result";
import { openApproval } from "../approvals/service";

export function listActions(
  agentId: string,
): Success<ActionRequest[]> | Failure {
  if (!memory.agents.has(agentId)) {
    return { ok: false, status: 404, error: "Agent not found." };
  }
  return {
    ok: true,
    value: memory.actions.filter((action) => action.agentId === agentId),
  };
}

export function getAction(actionId: string): ActionRequest | undefined {
  return memory.actions.find((action) => action.id === actionId);
}

export function submitAction(input: {
  agentId: string;
  action: ActionType;
  target: string;
  amount: string;
  token?: string;
  note?: string;
}): Success<ActionRequest> | Failure {
  if (!memory.agents.has(input.agentId)) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  let amount: bigint;
  try {
    amount = parseUsdc(input.amount);
  } catch (error) {
    if (error instanceof UsdcAmountError) {
      return { ok: false, status: 400, error: error.message };
    }
    throw error;
  }

  const now = new Date();
  const token = (input.token ?? USDC_SEPOLIA_ADDRESS).toLowerCase();
  const decision = evaluatePolicy({
    policy: memory.policies.get(input.agentId),
    action: input.action,
    target: input.target,
    token,
    amount,
    spentToday: spentToday(input.agentId, now),
  });

  const id = crypto.randomUUID();
  const action: ActionRequest = {
    id,
    agentId: input.agentId,
    action: input.action,
    target: input.target.trim(),
    token,
    amount: amount.toString(),
    nonce: id,
    note: input.note?.trim() || null,
    status: "BLOCKED",
    decision: decision.decision,
    reasons: decision.reasons,
    approvalRequestId: null,
    executionId: null,
    createdAt: now.toISOString(),
  };

  if (decision.decision === "ALLOW") {
    const execution = saveExecution(action.id, now);
    action.status = "EXECUTED";
    action.executionId = execution.id;
  } else if (decision.decision === "HUMAN_APPROVAL") {
    const approval = openApproval(action, decision.reasons, now);
    action.status = "AWAITING_APPROVAL";
    action.approvalRequestId = approval.id;
  }

  memory.actions.push(action);
  console.log(
    `${action.agentId} ${action.action} ${formatUsdc(action.amount)} USDC -> ${action.decision}`,
  );
  return { ok: true, value: action };
}

function spentToday(agentId: string, now: Date): bigint {
  const day = now.toISOString().slice(0, 10);
  let total = 0n;
  for (const action of memory.actions) {
    if (
      action.agentId !== agentId ||
      action.status !== "EXECUTED" ||
      !action.executionId
    ) {
      continue;
    }
    const execution = memory.executions.get(action.executionId);
    if (!execution || execution.executedAt.slice(0, 10) !== day) {
      continue;
    }
    total += BigInt(action.amount);
  }
  return total;
}

import {
  type ActionRequest,
  type ApprovalRequest,
  authorizationMatches,
  isExpired,
} from "@agentlatch/core";
import { saveExecution } from "../../executor";
import { memory } from "../../memory";
import type { Failure, Success } from "../../result";

const APPROVAL_TTL_MS = 15 * 60 * 1000;

export function listApprovals(): ApprovalRequest[] {
  return [...memory.approvals.values()].map((approval) =>
    expireIfNeeded(approval),
  );
}

export function getApproval(approvalId: string): ApprovalRequest | undefined {
  const approval = memory.approvals.get(approvalId);
  return approval ? expireIfNeeded(approval) : undefined;
}

export function openApproval(
  action: ActionRequest,
  reasons: string[],
  now: Date,
): ApprovalRequest {
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();
  const approval: ApprovalRequest = {
    id: crypto.randomUUID(),
    agentId: action.agentId,
    actionRequestId: action.id,
    action: action.action,
    amount: action.amount,
    token: action.token,
    target: action.target,
    reason: reasons.join(" "),
    status: "PENDING",
    expiresAt,
    createdAt: now.toISOString(),
    nonce: action.nonce,
    authorization: {
      agentId: action.agentId,
      action: action.action,
      target: action.target,
      token: action.token,
      amount: action.amount,
      nonce: action.nonce,
      expiresAt,
    },
  };
  memory.approvals.set(approval.id, approval);
  return approval;
}

export function resolveApproval(
  approvalId: string,
  outcome: "approve" | "reject",
): Success<{ approval: ApprovalRequest; action: ActionRequest }> | Failure {
  const approval = memory.approvals.get(approvalId);
  if (!approval) {
    return { ok: false, status: 404, error: "Approval not found." };
  }

  const now = new Date();
  expireIfNeeded(approval, now);
  if (approval.status !== "PENDING") {
    return { ok: false, status: 409, error: `Approval is ${approval.status}.` };
  }

  const action = memory.actions.find(
    (item) => item.id === approval.actionRequestId,
  );
  if (!action) {
    return { ok: false, status: 404, error: "Action not found." };
  }
  if (!authorizationMatches(approval.authorization, action)) {
    return {
      ok: false,
      status: 409,
      error: "Approval does not match the action.",
    };
  }

  if (outcome === "reject") {
    approval.status = "REJECTED";
    action.status = "REJECTED";
    console.log(`${action.agentId} approval ${approval.id} -> REJECTED`);
    return { ok: true, value: { approval, action } };
  }

  approval.status = "APPROVED";
  const execution = saveExecution(action.id, now);
  action.status = "EXECUTED";
  action.executionId = execution.id;
  console.log(`${action.agentId} approval ${approval.id} -> APPROVED`);
  return { ok: true, value: { approval, action } };
}

function expireIfNeeded(
  approval: ApprovalRequest,
  now = new Date(),
): ApprovalRequest {
  if (approval.status === "PENDING" && isExpired(approval.expiresAt, now)) {
    approval.status = "EXPIRED";
    const action = memory.actions.find(
      (item) => item.id === approval.actionRequestId,
    );
    if (action?.status === "AWAITING_APPROVAL") {
      action.status = "EXPIRED";
    }
  }
  return approval;
}

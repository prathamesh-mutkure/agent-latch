import {
  type ActionRequest,
  type ApprovalRequest,
  authorizationMatches,
} from "@agentlatch/core";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { db } from "../../db/client";
import { saveExecution } from "../../executor";
import { settleAuthorizedPayment } from "../../payments";
import type { Failure, Success } from "../../result";
import { toAction } from "../actions/dto";
import { actions } from "../actions/schema";
import { expireDue, recordAudit } from "../audit/service";
import { toApproval } from "./dto";
import { approvals } from "./schema";

const APPROVAL_TTL_MS = 15 * 60 * 1000;

export async function listApprovals(): Promise<ApprovalRequest[]> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await expireDue(tx, now);
    const rows = await tx
      .select()
      .from(approvals)
      .orderBy(asc(approvals.createdAt));
    return rows.map(toApproval);
  });
}

export async function getApproval(
  approvalId: string,
): Promise<ApprovalRequest | undefined> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await expireDue(tx, now);
    const rows = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);
    const row = rows[0];
    return row ? toApproval(row) : undefined;
  });
}

export async function openApproval(
  tx: Db,
  action: ActionRequest,
  reasons: string[],
  now: Date,
): Promise<ApprovalRequest> {
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
  await tx.insert(approvals).values({
    id: approval.id,
    agentId: approval.agentId,
    actionRequestId: approval.actionRequestId,
    action: approval.action,
    amount: approval.amount,
    token: approval.token,
    target: approval.target,
    reason: approval.reason,
    status: approval.status,
    expiresAt: new Date(expiresAt),
    createdAt: now,
    nonce: approval.nonce,
  });
  return approval;
}

export async function resolveApproval(
  approvalId: string,
  outcome: "approve" | "reject",
): Promise<
  Success<{ approval: ApprovalRequest; action: ActionRequest }> | Failure
> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await expireDue(tx, now);
    const approvalRows = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .limit(1);
    const approvalRow = approvalRows[0];
    if (!approvalRow) {
      return { ok: false, status: 404, error: "Approval not found." };
    }
    const approval = toApproval(approvalRow);
    if (approval.status !== "PENDING") {
      return {
        ok: false,
        status: 409,
        error: `Approval is ${approval.status}.`,
      };
    }

    const actionRows = await tx
      .select()
      .from(actions)
      .where(eq(actions.id, approval.actionRequestId))
      .limit(1);
    const actionRow = actionRows[0];
    if (!actionRow) {
      return { ok: false, status: 404, error: "Action not found." };
    }
    const action = toAction(actionRow);
    if (!authorizationMatches(approval.authorization, action)) {
      return {
        ok: false,
        status: 409,
        error: "Approval does not match the action.",
      };
    }

    if (outcome === "approve" && action.action === "X402_PAYMENT") {
      const settled = await settleAuthorizedPayment({
        target: action.target,
        token: action.token,
        amount: action.amount,
      });
      if (!settled.ok) {
        return settled;
      }
      action.reasons = [
        ...action.reasons,
        `x402 settled ${settled.value.txHash}`,
      ];
    }

    if (outcome === "reject") {
      approval.status = "REJECTED";
      action.status = "REJECTED";
      await tx
        .update(approvals)
        .set({ status: "REJECTED" })
        .where(eq(approvals.id, approval.id));
      await tx
        .update(actions)
        .set({ status: "REJECTED" })
        .where(eq(actions.id, action.id));
      await recordAudit(tx, {
        agentId: action.agentId,
        actionRequestId: action.id,
        approvalId: approval.id,
        kind: "REJECTED",
        summary: `Rejected ${approval.reason}`,
        createdAt: now,
      });
      console.log(`${action.agentId} approval ${approval.id} -> REJECTED`);
      return { ok: true, value: { approval, action } };
    }

    const execution = await saveExecution(
      tx,
      action.id,
      now,
      action.action === "X402_PAYMENT",
    );
    approval.status = "APPROVED";
    action.status = "EXECUTED";
    action.executionId = execution.id;
    await tx
      .update(approvals)
      .set({ status: "APPROVED" })
      .where(eq(approvals.id, approval.id));
    await tx
      .update(actions)
      .set({
        status: "EXECUTED",
        executionId: execution.id,
        reasons: action.reasons,
      })
      .where(eq(actions.id, action.id));
    await recordAudit(tx, {
      agentId: action.agentId,
      actionRequestId: action.id,
      approvalId: approval.id,
      kind: "APPROVED",
      summary: `Approved ${approval.reason}`,
      createdAt: now,
    });
    console.log(`${action.agentId} approval ${approval.id} -> APPROVED`);
    return { ok: true, value: { approval, action } };
  });
}

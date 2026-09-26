import {
  type ActionRequest,
  type ApprovalRequest,
  type ApprovalStatus,
  authorizationMatches,
} from "@agentlatch/core";
import {
  type BindingFields,
  checkApprovalTicket,
  computeBindingHash,
  type StepUpDecision,
  type WorldIdentity,
} from "@agentlatch/world";
import { and, asc, eq } from "drizzle-orm";
import type { Db, Tx } from "../../db/client";
import { db } from "../../db/client";
import { saveExecution } from "../../executor";
import { settleAuthorizedPayment } from "../../payments";
import type { Failure, Success } from "../../result";
import { toAction } from "../actions/dto";
import { actions } from "../actions/schema";
import { readPassportGate } from "../agents/passport";
import { agents } from "../agents/schema";
import { getAgent } from "../agents/service";
import { type AuditKind, expireDue, recordAudit } from "../audit/service";
import { users } from "../users/schema";
import { toApproval } from "./dto";
import { approvals } from "./schema";

/** A fresh approval is short-lived: the owner decides within five minutes. */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Outcome of a World step-up, shown on the approve page as `?result=`. */
export type StepUpResult =
  | "paid"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired"
  | "not_pending"
  | "binding"
  | "wrong_human"
  | "stale"
  | "payment_failed"
  | "deny_cancelled"
  | "passport_inactive"
  | "passport_unread";

type ApprovalRow = typeof approvals.$inferSelect;

function bindingFields(row: {
  id: string;
  agentId: string;
  action: string;
  target: string;
  token: string;
  amount: string;
  nonce: string;
  expiresAt: Date;
}): BindingFields {
  return {
    approvalId: row.id,
    agentId: row.agentId,
    action: row.action,
    target: row.target,
    token: row.token,
    amount: row.amount,
    nonce: row.nonce,
    expiresAt: row.expiresAt.toISOString(),
  };
}

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

/** Pending approvals for the signed-in owner. The agent still polls the open list. */
export async function listOwnerApprovals(
  userId: string,
): Promise<ApprovalRequest[]> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await expireDue(tx, now);
    const rows = await tx
      .select({ approval: approvals })
      .from(approvals)
      .innerJoin(agents, eq(approvals.agentId, agents.id))
      .where(and(eq(agents.userId, userId), eq(approvals.status, "PENDING")))
      .orderBy(asc(approvals.createdAt));
    return rows.map((row) => toApproval(row.approval));
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
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
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
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    nonce: action.nonce,
    failureReason: null,
    authorization: {
      agentId: action.agentId,
      action: action.action,
      target: action.target,
      token: action.token,
      amount: action.amount,
      nonce: action.nonce,
      expiresAt: expiresAt.toISOString(),
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
    expiresAt,
    createdAt: now,
    nonce: approval.nonce,
    bindingHash: computeBindingHash(bindingFields({ ...approval, expiresAt })),
  });
  return approval;
}

type Loaded = {
  row: ApprovalRow;
  approval: ApprovalRequest;
  action: ActionRequest;
  ownerId: string | null;
};

/** Expires due approvals, then locks and loads one approval with its action and owner. */
async function loadForUpdate(
  tx: Tx,
  approvalId: string,
  now: Date,
): Promise<Success<Loaded> | Failure> {
  await expireDue(tx, now);
  const approvalRows = await tx
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1)
    .for("update");
  const row = approvalRows[0];
  if (!row) {
    return { ok: false, status: 404, error: "Approval not found." };
  }
  const actionRows = await tx
    .select()
    .from(actions)
    .where(eq(actions.id, row.actionRequestId))
    .limit(1);
  const actionRow = actionRows[0];
  if (!actionRow) {
    return { ok: false, status: 404, error: "Action not found." };
  }
  const agentRows = await tx
    .select({ userId: agents.userId })
    .from(agents)
    .where(eq(agents.id, row.agentId))
    .limit(1);
  return {
    ok: true,
    value: {
      row,
      approval: toApproval(row),
      action: toAction(actionRow),
      ownerId: agentRows[0]?.userId ?? null,
    },
  };
}

/** Ends an approval without running the action. */
async function closeApproval(
  tx: Tx,
  loaded: Loaded,
  outcome: {
    status: Exclude<ApprovalStatus, "PENDING" | "APPROVED">;
    kind: AuditKind;
    summary: string;
    failureReason?: string;
    now: Date;
  },
) {
  const { approval, action } = loaded;
  const actionStatus = outcome.status === "EXPIRED" ? "EXPIRED" : "REJECTED";
  approval.status = outcome.status;
  approval.failureReason = outcome.failureReason ?? null;
  action.status = actionStatus;
  await tx
    .update(approvals)
    .set({
      status: outcome.status,
      failureReason: outcome.failureReason ?? null,
    })
    .where(eq(approvals.id, approval.id));
  await tx
    .update(actions)
    .set({ status: actionStatus })
    .where(eq(actions.id, action.id));
  await recordAudit(tx, {
    agentId: action.agentId,
    actionRequestId: action.id,
    approvalId: approval.id,
    kind: outcome.kind,
    summary: outcome.summary,
    createdAt: outcome.now,
  });
  console.log(
    `${action.agentId} approval ${approval.id} -> ${outcome.status}${
      outcome.failureReason ? ` ${outcome.failureReason}` : ""
    }`,
  );
}

function requireOwner(loaded: Loaded, userId: string): Failure | undefined {
  if (!loaded.ownerId || loaded.ownerId !== userId) {
    return {
      ok: false,
      status: 403,
      error: "Only this agent's owner can decide its approvals.",
    };
  }
  if (loaded.approval.status !== "PENDING") {
    return {
      ok: false,
      status: 409,
      error: `Approval is ${loaded.approval.status}.`,
    };
  }
  return undefined;
}

/**
 * Owner pressed Approve or Deny. Records when the World step-up started, which
 * the freshness check compares `auth_time` against. Returns the binding hash.
 */
export async function startStepUp(
  approvalId: string,
  userId: string,
): Promise<Success<{ bindingHash: string }> | Failure> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, approvalId, now);
    if (!loaded.ok) {
      return loaded;
    }
    const refused = requireOwner(loaded.value, userId);
    if (refused) {
      return refused;
    }
    const bindingHash = loaded.value.row.bindingHash;
    if (!bindingHash) {
      return {
        ok: false,
        status: 409,
        error: "Approval predates World binding. Ask the agent to retry.",
      };
    }
    await tx
      .update(approvals)
      .set({ stepUpStartedAt: now })
      .where(eq(approvals.id, approvalId));
    return { ok: true, value: { bindingHash } };
  });
}

/**
 * Owner backed out on the World screen. Backing out of Approve cancels the
 * approval. Backing out of Deny leaves it pending, so the owner can decide again.
 */
export async function cancelStepUp(
  approvalId: string,
  userId: string | null,
  decision: StepUpDecision,
): Promise<StepUpResult> {
  if (decision === "deny") {
    return "deny_cancelled";
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, approvalId, now);
    if (!loaded.ok) {
      return "not_pending";
    }
    if (loaded.value.approval.status === "EXPIRED") {
      return "expired";
    }
    if (!userId || requireOwner(loaded.value, userId)) {
      return "not_pending";
    }
    await closeApproval(tx, loaded.value, {
      status: "CANCELLED",
      kind: "CANCELLED",
      summary: `Cancelled on the World ID screen: ${loaded.value.approval.reason}`,
      now,
    });
    return "cancelled";
  });
}

const failureResults = {
  BINDING: "binding",
  WRONG_HUMAN: "wrong_human",
  STALE_VERIFICATION: "stale",
} as const;

/**
 * Runs the server-side checks on a validated World ticket, then applies the
 * owner's decision: deny closes the approval, approve executes the action.
 * The agent never triggers execution; only this path does.
 */
export async function decideWithWorld(
  approvalId: string,
  identity: WorldIdentity,
  cookieNonce: string,
  decision: StepUpDecision,
): Promise<StepUpResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, approvalId, now);
    if (!loaded.ok) {
      return "not_pending";
    }
    const { row, approval, action, ownerId } = loaded.value;
    const ownerRows = ownerId
      ? await tx
          .select({ iss: users.worldIss, sub: users.worldSub })
          .from(users)
          .where(eq(users.id, ownerId))
          .limit(1)
      : [];

    const check = checkApprovalTicket({
      identity,
      approval: {
        status: row.status,
        expiresAt: row.expiresAt,
        bindingHash: row.bindingHash,
        stepUpStartedAt: row.stepUpStartedAt,
        fields: bindingFields(row),
      },
      owner: ownerRows[0] ?? null,
      cookieNonce,
      decision,
      now,
    });

    if (!check.ok) {
      switch (check.reason) {
        case "NOT_PENDING":
          return approval.status === "EXPIRED" ? "expired" : "not_pending";
        case "EXPIRED":
          await closeApproval(tx, loaded.value, {
            status: "EXPIRED",
            kind: "EXPIRED",
            summary: `Approval expired before World ID finished: ${approval.reason}`,
            now,
          });
          return "expired";
        default:
          await closeApproval(tx, loaded.value, {
            status: "FAILED",
            kind: "FAILED",
            summary: `World ID check failed (${check.reason}): ${approval.reason}`,
            failureReason: check.reason,
            now,
          });
          return failureResults[check.reason];
      }
    }

    if (decision === "deny") {
      await closeApproval(tx, loaded.value, {
        status: "REJECTED",
        kind: "REJECTED",
        summary: `Denied with a fresh World ID proof: ${approval.reason}`,
        now,
      });
      await tx
        .update(approvals)
        .set({ worldAuthTime: identity.authTime })
        .where(eq(approvals.id, approval.id));
      return "denied";
    }

    if (!authorizationMatches(approval.authorization, action)) {
      await closeApproval(tx, loaded.value, {
        status: "FAILED",
        kind: "FAILED",
        summary: `Approval no longer matches the action: ${approval.reason}`,
        failureReason: "BINDING",
        now,
      });
      return "binding";
    }

    // The agent's ENS name must still be registered and unexpired before anything runs.
    const agent = await getAgent(action.agentId);
    const gate = agent
      ? await readPassportGate(agent.name, now)
      : ({ state: "inactive", reason: "Agent not found." } as const);
    if (gate.state === "unread") {
      // ENS could not be read. Leave the approval pending so the owner can retry.
      return "passport_unread";
    }
    if (gate.state === "inactive") {
      await closeApproval(tx, loaded.value, {
        status: "FAILED",
        kind: "FAILED",
        summary: `${gate.reason} Approval not executed: ${approval.reason}`,
        failureReason: "PASSPORT_INACTIVE",
        now,
      });
      return "passport_inactive";
    }

    const paid = action.action === "X402_PAYMENT";
    if (paid) {
      const settled = await settleAuthorizedPayment({
        target: action.target,
        token: action.token,
        amount: action.amount,
      });
      if (!settled.ok) {
        await closeApproval(tx, loaded.value, {
          status: "FAILED",
          kind: "FAILED",
          summary: `Payment failed after World ID approval: ${settled.error}`,
          failureReason: "PAYMENT_FAILED",
          now,
        });
        return "payment_failed";
      }
      action.reasons = [
        ...action.reasons,
        `x402 settled ${settled.value.txHash}`,
      ];
    }

    const execution = await saveExecution(tx, action.id, now, paid);
    await tx
      .update(approvals)
      .set({ status: "APPROVED", worldAuthTime: identity.authTime })
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
      summary: `Approved with a fresh World ID proof: ${approval.reason}`,
      createdAt: now,
    });
    console.log(
      `${action.agentId} approval ${approval.id} -> APPROVED with World ID`,
    );
    return paid ? "paid" : "approved";
  });
}

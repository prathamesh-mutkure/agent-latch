import {
  type ActionRequest,
  type ApprovalRequest,
  type ApprovalStatus,
  authorizationMatches,
  formatUsdc,
} from "@agentlatch/core";
import {
  type BindingFields,
  computeBindingHash,
  type Decision,
  type DecisionChallenge,
  decisionChallenge,
  verifyWalletAuth,
  type WalletAuthPayload,
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

/** Outcome of a signed World App decision, shown on the approve page as `?result=`. */
export type DecisionResult =
  | "paid"
  | "approved"
  | "denied"
  | "expired"
  | "binding"
  | "payment_failed"
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

/** Pending approvals for one owner. The agent still polls the open list. */
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
    decidedBy: null,
    decidedAt: null,
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

type Pending = {
  row: ApprovalRow;
  agentName: string;
  ownerId: string | null;
  ownerWallet: string | null;
};

/** Reads one pending approval with its agent name and owner wallet. No lock. */
async function readPending(
  approvalId: string,
  now: Date,
): Promise<Success<Pending> | Failure> {
  const rows = await db.transaction(async (tx) => {
    await expireDue(tx, now);
    return tx
      .select({
        row: approvals,
        agentName: agents.name,
        ownerId: agents.userId,
        ownerWallet: users.worldWallet,
      })
      .from(approvals)
      .innerJoin(agents, eq(approvals.agentId, agents.id))
      .leftJoin(users, eq(agents.userId, users.id))
      .where(eq(approvals.id, approvalId))
      .limit(1);
  });
  const found = rows[0];
  if (!found) {
    return { ok: false, status: 404, error: "Approval not found." };
  }
  if (found.row.status !== "PENDING") {
    return {
      ok: false,
      status: 409,
      error: `Approval is ${found.row.status}.`,
    };
  }
  if (!found.row.bindingHash) {
    return {
      ok: false,
      status: 409,
      error: "Approval has no binding. Ask the agent to retry.",
    };
  }
  if (!found.ownerWallet) {
    return {
      ok: false,
      status: 403,
      error: "Claim this agent in World App first.",
    };
  }
  return { ok: true, value: found };
}

function challengeFor(pending: Pending, decision: Decision): DecisionChallenge {
  const { row } = pending;
  return decisionChallenge({
    approvalId: row.id,
    bindingHash: row.bindingHash ?? "",
    decision,
    agentName: pending.agentName,
    action: row.action,
    amountUsdc: formatUsdc(row.amount),
    expiresAt: row.expiresAt.toISOString(),
  });
}

/** What World App signs for one decision. Rebuilt from the stored approval each time. */
export async function getDecisionChallenge(
  approvalId: string,
  decision: Decision,
): Promise<Success<DecisionChallenge> | Failure> {
  const pending = await readPending(approvalId, new Date());
  if (!pending.ok) {
    return pending;
  }
  return { ok: true, value: challengeFor(pending.value, decision) };
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
    decidedBy?: string;
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
      ...(outcome.decidedBy
        ? { decidedBy: outcome.decidedBy, decidedAt: outcome.now }
        : {}),
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

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/**
 * The owner signed Approve or Deny in World App. The signature must come from
 * the wallet that claimed the agent and cover this approval, this exact action,
 * and this decision. Deny closes the approval; approve executes the action.
 * The agent never triggers execution; only this path does.
 */
export async function decideInWorldApp(
  approvalId: string,
  decision: Decision,
  payload: WalletAuthPayload,
): Promise<Success<DecisionResult> | Failure> {
  const pending = await readPending(approvalId, new Date());
  if (!pending.ok) {
    return pending;
  }
  const { row: seen, ownerId, ownerWallet } = pending.value;

  // Verified before the row lock: Safe signatures are checked on World Chain.
  const check = await verifyWalletAuth(
    payload,
    challengeFor(pending.value, decision),
    process.env.WORLDCHAIN_RPC_URL?.trim() || undefined,
  );
  if (!check.ok) {
    return { ok: false, status: 400, error: check.error };
  }
  if (check.wallet !== ownerWallet) {
    return {
      ok: false,
      status: 403,
      error: "This World App wallet does not own the agent.",
    };
  }
  const signer = check.wallet;

  const now = new Date();
  return db.transaction(
    async (tx): Promise<Success<DecisionResult> | Failure> => {
      const loaded = await loadForUpdate(tx, approvalId, now);
      if (!loaded.ok) {
        return loaded;
      }
      const { row, approval, action } = loaded.value;
      if (row.status === "EXPIRED") {
        return { ok: true, value: "expired" };
      }
      if (row.status !== "PENDING") {
        return { ok: false, status: 409, error: `Approval is ${row.status}.` };
      }
      if (loaded.value.ownerId !== ownerId) {
        return {
          ok: false,
          status: 409,
          error: "The agent changed owner. Open the approval again.",
        };
      }

      if (
        !row.bindingHash ||
        row.bindingHash !== seen.bindingHash ||
        row.bindingHash !== computeBindingHash(bindingFields(row)) ||
        !authorizationMatches(approval.authorization, action)
      ) {
        await closeApproval(tx, loaded.value, {
          status: "FAILED",
          kind: "FAILED",
          summary: `Approval no longer matches the action: ${approval.reason}`,
          failureReason: "BINDING",
          now,
        });
        return { ok: true, value: "binding" };
      }

      if (decision === "deny") {
        await closeApproval(tx, loaded.value, {
          status: "REJECTED",
          kind: "REJECTED",
          summary: `Denied in World App by ${shortWallet(signer)}: ${approval.reason}`,
          decidedBy: signer,
          now,
        });
        return { ok: true, value: "denied" };
      }

      // The agent's ENS name must still be registered and unexpired before anything runs.
      const agent = await getAgent(action.agentId);
      const gate = agent
        ? await readPassportGate(agent.name, now)
        : ({ state: "inactive", reason: "Agent not found." } as const);
      if (gate.state === "unread") {
        // ENS could not be read. Leave the approval pending so the owner can retry.
        return { ok: true, value: "passport_unread" };
      }
      if (gate.state === "inactive") {
        await closeApproval(tx, loaded.value, {
          status: "FAILED",
          kind: "FAILED",
          summary: `${gate.reason} Approval not executed: ${approval.reason}`,
          failureReason: "PASSPORT_INACTIVE",
          decidedBy: signer,
          now,
        });
        return { ok: true, value: "passport_inactive" };
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
            summary: `Payment failed after World App approval: ${settled.error}`,
            failureReason: "PAYMENT_FAILED",
            decidedBy: signer,
            now,
          });
          return { ok: true, value: "payment_failed" };
        }
        action.reasons = [
          ...action.reasons,
          `x402 settled ${settled.value.txHash}`,
        ];
      }

      const execution = await saveExecution(tx, action.id, now, paid);
      await tx
        .update(approvals)
        .set({ status: "APPROVED", decidedBy: signer, decidedAt: now })
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
        summary: `Approved in World App by ${shortWallet(signer)}: ${approval.reason}`,
        createdAt: now,
      });
      console.log(
        `${action.agentId} approval ${approval.id} -> APPROVED in World App`,
      );
      return { ok: true, value: paid ? "paid" : "approved" };
    },
  );
}

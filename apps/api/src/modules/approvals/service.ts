import {
  type ActionRequest,
  type ApprovalRequest,
  type ApprovalStatus,
  authorizationMatches,
  formatUsdc,
  type WorldIdCheckStatus,
} from "@agentlatch/core";
import {
  type BindingFields,
  computeBindingHash,
  type Decision,
  type DecisionChallenge,
  type DeviceCheck,
  type DeviceOutcome,
  decisionChallenge,
  startDeviceCheck,
  type VerifiedHuman,
  verifyWalletAuth,
  type WalletAuthPayload,
  worldIdError,
} from "@agentlatch/world";
import { and, asc, desc, eq } from "drizzle-orm";
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
import { approvals, worldIdChecks } from "./schema";
import {
  stopWorldIdChecks,
  type WatchedCheck,
  watchWorldIdCheck,
  worldIdSettings,
} from "./world-id";

/** A fresh approval is short-lived: the owner decides within five minutes. */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** The World ID for Agents step the owner finishes after signing Approve. */
export type WorldIdPrompt = {
  url: string;
  userCode: string;
  expiresAt: string;
};

/**
 * Outcome of a signed World App decision. Approve never runs the action here:
 * it returns the World ID check, and the action runs once World ID verifies.
 */
export type DecisionOutcome =
  | { result: "denied" | "expired" | "binding" | "passport_inactive" }
  | { result: "verify"; worldId: WorldIdPrompt };

type ApprovalRow = typeof approvals.$inferSelect;
type CheckRow = typeof worldIdChecks.$inferSelect;

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
    worldIdStatus: null,
    worldIdError: null,
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

/** The agent's ENS name must be registered and unexpired before anything runs. */
async function passportGate(agentId: string, now: Date) {
  const agent = await getAgent(agentId);
  return agent
    ? readPassportGate(agent.name, now)
    : ({ state: "inactive", reason: "Agent not found." } as const);
}

function bindingHolds(loaded: Loaded, expected: string | null): boolean {
  const { row, approval, action } = loaded;
  return (
    Boolean(row.bindingHash) &&
    row.bindingHash === expected &&
    row.bindingHash === computeBindingHash(bindingFields(row)) &&
    authorizationMatches(approval.authorization, action)
  );
}

function promptFor(check: CheckRow): WorldIdPrompt {
  return {
    url: check.verificationUrl,
    userCode: check.userCode,
    expiresAt: check.expiresAt.toISOString(),
  };
}

function watched(check: CheckRow, deadline: Date): WatchedCheck | undefined {
  if (!check.deviceCode) {
    return undefined;
  }
  return {
    id: check.id,
    deviceCode: check.deviceCode,
    userCode: check.userCode,
    verificationUrl: check.verificationUrl,
    pollInterval: check.pollInterval,
    startedAt: check.startedAt,
    expiresAt: check.expiresAt,
    deadline,
  };
}

/** Ends one World ID check and copies its status onto the approval. */
async function endCheck(
  tx: Tx,
  check: CheckRow,
  status: Exclude<WorldIdCheckStatus, "WAITING">,
  now: Date,
  detail: { error?: string; human?: VerifiedHuman } = {},
) {
  await tx
    .update(worldIdChecks)
    .set({
      status,
      error: detail.error ?? null,
      subject: detail.human?.subject ?? null,
      authTime: detail.human?.authTime ?? null,
      deviceCode: null,
      finishedAt: now,
    })
    .where(eq(worldIdChecks.id, check.id));
  await tx
    .update(approvals)
    .set({ worldIdStatus: status, worldIdError: detail.error ?? null })
    .where(eq(approvals.id, check.approvalId));
  console.log(
    `approval ${check.approvalId} world id check ${check.id} -> ${status}${
      detail.error ? ` ${detail.error}` : ""
    }`,
  );
}

/** Cancels the waiting World ID check when the approval ends another way. */
async function cancelWaitingChecks(
  tx: Tx,
  approvalId: string,
  now: Date,
  error: string,
): Promise<string[]> {
  const ended = await tx
    .update(worldIdChecks)
    .set({ status: "CANCELLED", error, deviceCode: null, finishedAt: now })
    .where(
      and(
        eq(worldIdChecks.approvalId, approvalId),
        eq(worldIdChecks.status, "WAITING"),
      ),
    )
    .returning({ id: worldIdChecks.id });
  if (ended.length > 0) {
    await tx
      .update(approvals)
      .set({ worldIdStatus: "CANCELLED", worldIdError: error })
      .where(eq(approvals.id, approvalId));
  }
  return ended.map((row) => row.id);
}

const WORLD_ID_MISSING: Failure = {
  ok: false,
  status: 503,
  error: "World ID for Agents is not configured on the API.",
};

type Decided = {
  outcome: DecisionOutcome;
  watch?: WatchedCheck;
  stop?: string[];
};

/**
 * The owner signed Approve or Deny in World App. The signature must come from
 * the wallet that claimed the agent and cover this approval, this exact action,
 * and this decision. Deny closes the approval. Approve starts a World ID for
 * Agents device check and returns its link; the action runs only after World
 * ID verifies a fresh proof (see `settleWorldIdCheck`). The agent never
 * triggers execution.
 */
export async function decideInWorldApp(
  approvalId: string,
  decision: Decision,
  payload: WalletAuthPayload,
): Promise<Success<DecisionOutcome> | Failure> {
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
  const settings = worldIdSettings();
  if (decision === "approve" && !settings) {
    return WORLD_ID_MISSING;
  }

  const now = new Date();
  const decided = await db.transaction(
    async (tx): Promise<Success<Decided> | Failure> => {
      const loaded = await loadForUpdate(tx, approvalId, now);
      if (!loaded.ok) {
        return loaded;
      }
      const { row, approval } = loaded.value;
      if (row.status === "EXPIRED") {
        return { ok: true, value: { outcome: { result: "expired" } } };
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

      if (!bindingHolds(loaded.value, seen.bindingHash)) {
        const stop = await cancelWaitingChecks(
          tx,
          approval.id,
          now,
          "The action changed after the approval opened.",
        );
        await closeApproval(tx, loaded.value, {
          status: "FAILED",
          kind: "FAILED",
          summary: `Approval no longer matches the action: ${approval.reason}`,
          failureReason: "BINDING",
          now,
        });
        return { ok: true, value: { outcome: { result: "binding" }, stop } };
      }

      if (decision === "deny") {
        const stop = await cancelWaitingChecks(
          tx,
          approval.id,
          now,
          "Denied in World App.",
        );
        await closeApproval(tx, loaded.value, {
          status: "REJECTED",
          kind: "REJECTED",
          summary: `Denied in World App by ${shortWallet(signer)}: ${approval.reason}`,
          decidedBy: signer,
          now,
        });
        return { ok: true, value: { outcome: { result: "denied" }, stop } };
      }

      // A second Approve shows the check that is still waiting instead of starting another.
      const waiting = await tx
        .select()
        .from(worldIdChecks)
        .where(
          and(
            eq(worldIdChecks.approvalId, approval.id),
            eq(worldIdChecks.status, "WAITING"),
          ),
        )
        .orderBy(desc(worldIdChecks.startedAt))
        .limit(1);
      const current = waiting[0];
      if (current) {
        return {
          ok: true,
          value: {
            outcome: { result: "verify", worldId: promptFor(current) },
            watch: watched(current, row.expiresAt),
          },
        };
      }

      // Checked again before the action runs. This only avoids asking for a
      // proof that could not be used.
      const gate = await passportGate(approval.agentId, now);
      if (gate.state === "unread") {
        return {
          ok: false,
          status: 503,
          error: "The agent's ENS name could not be read. Try again.",
        };
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
        return {
          ok: true,
          value: { outcome: { result: "passport_inactive" } },
        };
      }

      if (!settings) {
        return WORLD_ID_MISSING;
      }
      let started: DeviceCheck;
      try {
        started = await startDeviceCheck(settings);
      } catch (error) {
        return { ok: false, status: 503, error: worldIdError(error) };
      }
      const inserted = await tx
        .insert(worldIdChecks)
        .values({
          id: crypto.randomUUID(),
          approvalId: approval.id,
          wallet: signer,
          bindingHash: row.bindingHash ?? "",
          deviceCode: started.deviceCode,
          userCode: started.userCode,
          verificationUrl: started.verificationUrl,
          pollInterval: started.interval,
          status: "WAITING",
          startedAt: now,
          expiresAt: started.expiresAt,
        })
        .returning();
      await tx
        .update(approvals)
        .set({ worldIdStatus: "WAITING", worldIdError: null })
        .where(eq(approvals.id, approval.id));
      const created = inserted[0] as CheckRow;
      console.log(
        `approval ${approval.id} world id check ${created.id} -> WAITING`,
      );
      return {
        ok: true,
        value: {
          outcome: { result: "verify", worldId: promptFor(created) },
          watch: watched(created, row.expiresAt),
        },
      };
    },
  );
  if (!decided.ok) {
    return decided;
  }
  if (decided.value.stop) {
    stopWorldIdChecks(decided.value.stop);
  }
  if (decided.value.watch) {
    watchWorldIdCheck(decided.value.watch, settleWorldIdCheck);
  }
  return { ok: true, value: decided.value.outcome };
}

async function ownerWallet(tx: Tx, userId: string | null) {
  if (!userId) {
    return null;
  }
  const rows = await tx
    .select({ wallet: users.worldWallet })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.wallet ?? null;
}

/** World ID verified the owner's check. Re-checks everything, then runs the action. */
async function runVerified(
  tx: Tx,
  loaded: Loaded,
  check: CheckRow,
  human: VerifiedHuman,
  now: Date,
) {
  const { approval, action } = loaded;
  if ((await ownerWallet(tx, loaded.ownerId)) !== check.wallet) {
    await endCheck(tx, check, "FAILED", now, {
      error: "The agent changed owner. Approve again.",
      human,
    });
    return;
  }
  if (!bindingHolds(loaded, check.bindingHash)) {
    await endCheck(tx, check, "FAILED", now, {
      error: "The action changed after the check started.",
      human,
    });
    await closeApproval(tx, loaded, {
      status: "FAILED",
      kind: "FAILED",
      summary: `Approval no longer matches the action: ${approval.reason}`,
      failureReason: "BINDING",
      now,
    });
    return;
  }
  const gate = await passportGate(action.agentId, now);
  if (gate.state === "unread") {
    // ENS could not be read. The approval stays pending so the owner can approve again.
    await endCheck(tx, check, "FAILED", now, {
      error: "The agent's ENS name could not be read. Approve again.",
      human,
    });
    return;
  }

  await endCheck(tx, check, "VERIFIED", now, { human });
  const decider = shortWallet(check.wallet);
  if (gate.state === "inactive") {
    await closeApproval(tx, loaded, {
      status: "FAILED",
      kind: "FAILED",
      summary: `${gate.reason} Approval not executed: ${approval.reason}`,
      failureReason: "PASSPORT_INACTIVE",
      decidedBy: check.wallet,
      now,
    });
    return;
  }

  const paid = action.action === "X402_PAYMENT";
  if (paid) {
    const settled = await settleAuthorizedPayment({
      target: action.target,
      token: action.token,
      amount: action.amount,
    });
    if (!settled.ok) {
      await closeApproval(tx, loaded, {
        status: "FAILED",
        kind: "FAILED",
        summary: `Payment failed after World ID approval: ${settled.error}`,
        failureReason: "PAYMENT_FAILED",
        decidedBy: check.wallet,
        now,
      });
      return;
    }
    action.reasons = [
      ...action.reasons,
      `x402 settled ${settled.value.txHash}`,
    ];
  }

  const execution = await saveExecution(tx, action.id, now, paid);
  await tx
    .update(approvals)
    .set({ status: "APPROVED", decidedBy: check.wallet, decidedAt: now })
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
    summary: `Approved in World App by ${decider}, confirmed with World ID for Agents: ${approval.reason}`,
    createdAt: now,
  });
  console.log(`${action.agentId} approval ${approval.id} -> APPROVED`);
}

/**
 * Applies what World ID returned for one check. Deny on World ID rejects the
 * approval. Expiry and failures leave it pending for another Approve. Only a
 * verified check runs the action, and only while the approval is still pending.
 */
export async function settleWorldIdCheck(
  checkId: string,
  outcome: DeviceOutcome,
): Promise<void> {
  const found = await db
    .select({ approvalId: worldIdChecks.approvalId })
    .from(worldIdChecks)
    .where(eq(worldIdChecks.id, checkId))
    .limit(1);
  const approvalId = found[0]?.approvalId;
  if (!approvalId) {
    return;
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    // Same lock order as decide: the approval first, then the check.
    const loaded = await loadForUpdate(tx, approvalId, now);
    const checks = await tx
      .select()
      .from(worldIdChecks)
      .where(eq(worldIdChecks.id, checkId))
      .limit(1)
      .for("update");
    const check = checks[0];
    if (check?.status !== "WAITING") {
      return;
    }
    if (!loaded.ok) {
      await endCheck(tx, check, "FAILED", now, { error: loaded.error });
      return;
    }
    const { row, approval } = loaded.value;
    if (row.status !== "PENDING") {
      await endCheck(
        tx,
        check,
        row.status === "EXPIRED" ? "EXPIRED" : "CANCELLED",
        now,
        { error: `The approval is ${row.status}.` },
      );
      return;
    }
    switch (outcome.status) {
      case "stopped":
      case "expired":
        await endCheck(tx, check, "EXPIRED", now, {
          error:
            "The World ID check expired. Approve again to start a new one.",
        });
        return;
      case "failed":
        await endCheck(tx, check, "FAILED", now, { error: outcome.error });
        return;
      case "denied":
        await endCheck(tx, check, "DENIED", now);
        await closeApproval(tx, loaded.value, {
          status: "REJECTED",
          kind: "REJECTED",
          summary: `Denied on World ID for Agents: ${approval.reason}`,
          decidedBy: check.wallet,
          now,
        });
        return;
      case "verified":
        await runVerified(tx, loaded.value, check, outcome.human, now);
        return;
    }
  });
}

/** Resumes polling for checks that were waiting when the API stopped. */
export async function resumeWorldIdChecks(): Promise<number> {
  const rows = await db
    .select({ check: worldIdChecks, deadline: approvals.expiresAt })
    .from(worldIdChecks)
    .innerJoin(approvals, eq(worldIdChecks.approvalId, approvals.id))
    .where(eq(worldIdChecks.status, "WAITING"));
  for (const { check, deadline } of rows) {
    const target = watched(check, deadline);
    if (target) {
      watchWorldIdCheck(target, settleWorldIdCheck);
    } else {
      await settleWorldIdCheck(check.id, {
        status: "failed",
        error: "The World ID check lost its device code.",
      });
    }
  }
  return rows.length;
}

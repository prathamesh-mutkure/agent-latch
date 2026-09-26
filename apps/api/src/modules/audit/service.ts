import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "../../db/client";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import { actions } from "../actions/schema";
import { agents } from "../agents/schema";
import { approvals } from "../approvals/schema";
import { auditEvents } from "./schema";

export type AuditKind =
  | "AGENT_CREATED"
  | "POLICY_SET"
  | "ALLOW"
  | "BLOCK"
  | "HUMAN_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export type AuditEventDto = {
  id: string;
  agentId: string | null;
  actionRequestId: string | null;
  approvalId: string | null;
  kind: AuditKind;
  summary: string;
  createdAt: string;
};

export async function recordAudit(
  tx: Db,
  event: {
    agentId: string | null;
    actionRequestId?: string | null;
    approvalId?: string | null;
    kind: AuditKind;
    summary: string;
    createdAt?: Date;
  },
) {
  await tx.insert(auditEvents).values({
    id: crypto.randomUUID(),
    agentId: event.agentId,
    actionRequestId: event.actionRequestId ?? null,
    approvalId: event.approvalId ?? null,
    kind: event.kind,
    summary: event.summary,
    createdAt: event.createdAt ?? new Date(),
  });
}

export async function listAudit(
  agentId: string,
): Promise<Success<AuditEventDto[]> | Failure> {
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!existing[0]) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.agentId, agentId))
    .orderBy(asc(auditEvents.createdAt));

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      actionRequestId: row.actionRequestId,
      approvalId: row.approvalId,
      kind: row.kind as AuditKind,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function expireDue(tx: Db, now: Date) {
  const due = await tx
    .update(approvals)
    .set({ status: "EXPIRED" })
    .where(and(eq(approvals.status, "PENDING"), lte(approvals.expiresAt, now)))
    .returning();

  for (const approval of due) {
    await tx
      .update(actions)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(actions.id, approval.actionRequestId),
          eq(actions.status, "AWAITING_APPROVAL"),
        ),
      );
    await recordAudit(tx, {
      agentId: approval.agentId,
      actionRequestId: approval.actionRequestId,
      approvalId: approval.id,
      kind: "EXPIRED",
      summary: `Approval expired for ${approval.action}.`,
      createdAt: now,
    });
  }
}

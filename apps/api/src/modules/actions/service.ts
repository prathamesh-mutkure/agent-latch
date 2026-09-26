import {
  type ActionRequest,
  type ActionType,
  evaluatePolicy,
  formatUsdc,
  parseUsdc,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "@agentlatch/core";
import {
  InterceptaError,
  type PaymentScreen,
  screenPayment,
} from "@agentlatch/intercepta";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "../../db/client";
import { saveExecution } from "../../executor";
import { settleAuthorizedPayment } from "../../payments";
import type { Failure, Success } from "../../result";
import { loadPolicyTexts } from "../agents/ens";
import { readPassportGate } from "../agents/passport";
import { policyFromTexts } from "../agents/published";
import { getAgent } from "../agents/service";
import { openApproval } from "../approvals/service";
import { recordAudit } from "../audit/service";
import { notifyApproval } from "../notify/service";
import { toAction } from "./dto";
import { actions, executions } from "./schema";

export async function listActions(
  agentId: string,
): Promise<Success<ActionRequest[]> | Failure> {
  if (!(await getAgent(agentId))) {
    return { ok: false, status: 404, error: "Agent not found." };
  }
  const rows = await db
    .select()
    .from(actions)
    .where(eq(actions.agentId, agentId))
    .orderBy(asc(actions.createdAt));
  return { ok: true, value: rows.map(toAction) };
}

export async function getAction(
  actionId: string,
): Promise<ActionRequest | undefined> {
  const rows = await db
    .select()
    .from(actions)
    .where(eq(actions.id, actionId))
    .limit(1);
  const row = rows[0];
  return row ? toAction(row) : undefined;
}

export async function submitAction(input: {
  agentId: string;
  action: ActionType;
  target: string;
  amount: string;
  token?: string;
  note?: string;
}): Promise<Success<ActionRequest> | Failure> {
  const agent = await getAgent(input.agentId);
  if (!agent) {
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
  const target = input.target.trim();
  const passport = await readPassportGate(agent.name, now);
  if (passport.state === "unread") {
    return { ok: false, status: 503, error: passport.error };
  }
  let decision: {
    decision: "ALLOW" | "BLOCK" | "HUMAN_APPROVAL";
    reasons: string[];
  };
  if (passport.state === "inactive") {
    decision = { decision: "BLOCK", reasons: [passport.reason] };
  } else {
    let published: ReturnType<typeof policyFromTexts>;
    try {
      published = policyFromTexts(
        input.agentId,
        await loadPolicyTexts(passport.name),
      );
    } catch (error) {
      return {
        ok: false,
        status: 503,
        error:
          error instanceof Error
            ? error.message
            : "ENS policy could not be read.",
      };
    }
    decision = published
      ? evaluatePolicy({
          policy: published,
          action: input.action,
          target,
          token,
          amount,
          spentToday: await spentToday(input.agentId, now),
        })
      : {
          decision: "BLOCK",
          reasons: ["ENS policy is not published."],
        };
  }

  if (input.action === "X402_PAYMENT" && decision.decision !== "BLOCK") {
    const screened = await screenPayee(target);
    if (!screened.ok) {
      return screened;
    }
    decision = screened.value.blocked
      ? { decision: "BLOCK", reasons: [screened.value.detail] }
      : {
          decision: decision.decision,
          reasons: [...decision.reasons, screened.value.detail],
        };
  }

  let signed = false;
  if (input.action === "X402_PAYMENT" && decision.decision === "ALLOW") {
    const settled = await settleAuthorizedPayment({
      target,
      token,
      amount: amount.toString(),
    });
    if (!settled.ok) {
      return settled;
    }
    signed = true;
    decision = {
      decision: "ALLOW",
      reasons: [...decision.reasons, `x402 settled ${settled.value.txHash}`],
    };
  }

  const id = crypto.randomUUID();
  const action: ActionRequest = {
    id,
    agentId: input.agentId,
    action: input.action,
    target,
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

  await db.transaction(async (tx) => {
    await tx.insert(actions).values({
      id: action.id,
      agentId: action.agentId,
      action: action.action,
      target: action.target,
      token: action.token,
      amount: action.amount,
      nonce: action.nonce,
      note: action.note,
      status: "BLOCKED",
      decision: action.decision,
      reasons: action.reasons,
      approvalRequestId: null,
      executionId: null,
      createdAt: now,
    });

    if (decision.decision === "ALLOW") {
      const execution = await saveExecution(tx, action.id, now, signed);
      action.status = "EXECUTED";
      action.executionId = execution.id;
      await tx
        .update(actions)
        .set({ status: "EXECUTED", executionId: execution.id })
        .where(eq(actions.id, action.id));
    } else if (decision.decision === "HUMAN_APPROVAL") {
      const approval = await openApproval(tx, action, decision.reasons, now);
      action.status = "AWAITING_APPROVAL";
      action.approvalRequestId = approval.id;
      await tx
        .update(actions)
        .set({
          status: "AWAITING_APPROVAL",
          approvalRequestId: approval.id,
        })
        .where(eq(actions.id, action.id));
    }

    await recordAudit(tx, {
      agentId: action.agentId,
      actionRequestId: action.id,
      approvalId: action.approvalRequestId,
      kind: decision.decision,
      summary: action.reasons[0] ?? decision.decision,
      createdAt: now,
    });
  });

  console.log(
    `${action.agentId} ${action.action} ${formatUsdc(action.amount)} USDC -> ${action.decision}`,
  );
  if (action.decision === "HUMAN_APPROVAL" && action.approvalRequestId) {
    void notifyApproval({
      agentId: action.agentId,
      approvalId: action.approvalRequestId,
      action: action.action,
      amount: action.amount,
    });
  }
  return { ok: true, value: action };
}

function isPayee(value: string): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(value) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)
  );
}

async function screenPayee(
  payTo: string,
): Promise<Success<PaymentScreen> | Failure> {
  if (!isPayee(payTo)) {
    return {
      ok: false,
      status: 400,
      error: "Payment target must be an Ethereum address or ENS name.",
    };
  }
  try {
    return {
      ok: true,
      value: await screenPayment({
        payTo,
        apiKey: process.env.INTERCEPTA_API_KEY ?? "",
      }),
    };
  } catch (error) {
    const message =
      error instanceof InterceptaError
        ? error.message
        : "Intercepta screening failed.";
    return { ok: false, status: 400, error: message };
  }
}

async function spentToday(agentId: string, now: Date): Promise<bigint> {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const rows = await db
    .select({ amount: actions.amount })
    .from(actions)
    .innerJoin(executions, eq(actions.executionId, executions.id))
    .where(
      and(
        eq(actions.agentId, agentId),
        eq(actions.status, "EXECUTED"),
        gte(executions.executedAt, start),
      ),
    );
  return rows.reduce((total, row) => total + BigInt(row.amount), 0n);
}

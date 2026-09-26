import {
  type ActionType,
  type Agent,
  actionTypes,
  formatUsdc,
  type Policy,
  parseUsdc,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "@agentlatch/core";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import { recordAudit } from "../audit/service";
import { toAgent, toPolicy } from "./dto";
import { agents, policies } from "./schema";

export async function createAgent(name: string): Promise<Agent> {
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  const createdAt = new Date(agent.createdAt);
  await db.transaction(async (tx) => {
    await tx.insert(agents).values({
      id: agent.id,
      name: agent.name,
      createdAt,
    });
    await recordAudit(tx, {
      agentId: agent.id,
      kind: "AGENT_CREATED",
      summary: `Created agent ${agent.name}.`,
      createdAt,
    });
  });
  return agent;
}

export async function listAgents(): Promise<Agent[]> {
  const rows = await db.select().from(agents).orderBy(agents.createdAt);
  return rows.map(toAgent);
}

export async function getAgent(agentId: string): Promise<Agent | undefined> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  const row = rows[0];
  return row ? toAgent(row) : undefined;
}

export async function getPolicy(agentId: string): Promise<Policy | undefined> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.agentId, agentId))
    .limit(1);
  const row = rows[0];
  return row ? toPolicy(row) : undefined;
}

export async function setPolicy(
  agentId: string,
  input: {
    autonomousLimit: string;
    hardLimit: string;
    dailyLimit?: string;
    allowedActions?: ActionType[];
    allowedTargets?: string[];
  },
): Promise<Success<Policy> | Failure> {
  if (!(await getAgent(agentId))) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  let autonomous: bigint;
  let hard: bigint;
  let daily: bigint | null = null;
  try {
    autonomous = parseUsdc(input.autonomousLimit);
    hard = parseUsdc(input.hardLimit);
    if (input.dailyLimit !== undefined) {
      daily = parseUsdc(input.dailyLimit);
    }
  } catch (error) {
    if (error instanceof UsdcAmountError) {
      return { ok: false, status: 400, error: error.message };
    }
    throw error;
  }

  if (hard < autonomous) {
    return {
      ok: false,
      status: 400,
      error:
        "Hard limit must be greater than or equal to the autonomous limit.",
    };
  }
  if (daily !== null && daily < autonomous) {
    return {
      ok: false,
      status: 400,
      error:
        "Daily limit must be greater than or equal to the autonomous limit.",
    };
  }

  const allowedActions = [...new Set(input.allowedActions ?? actionTypes)];
  if (allowedActions.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "At least one action must be allowed.",
    };
  }

  const updatedAt = new Date();
  const policy: Policy = {
    agentId,
    autonomousLimit: autonomous.toString(),
    hardLimit: hard.toString(),
    dailyLimit: daily === null ? null : daily.toString(),
    allowedActions,
    allowedTokens: [USDC_SEPOLIA_ADDRESS.toLowerCase()],
    allowedTargets: (input.allowedTargets ?? []).map((target) => target.trim()),
    updatedAt: updatedAt.toISOString(),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(policies)
      .values({
        agentId,
        autonomousLimit: policy.autonomousLimit,
        hardLimit: policy.hardLimit,
        dailyLimit: policy.dailyLimit,
        allowedActions: policy.allowedActions,
        allowedTokens: policy.allowedTokens,
        allowedTargets: policy.allowedTargets,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: policies.agentId,
        set: {
          autonomousLimit: policy.autonomousLimit,
          hardLimit: policy.hardLimit,
          dailyLimit: policy.dailyLimit,
          allowedActions: policy.allowedActions,
          allowedTokens: policy.allowedTokens,
          allowedTargets: policy.allowedTargets,
          updatedAt,
        },
      });
    await recordAudit(tx, {
      agentId,
      kind: "POLICY_SET",
      summary: `Policy set. Autonomous limit ${formatUsdc(policy.autonomousLimit)} USDC, hard limit ${formatUsdc(policy.hardLimit)} USDC.`,
      createdAt: updatedAt,
    });
  });

  return { ok: true, value: policy };
}

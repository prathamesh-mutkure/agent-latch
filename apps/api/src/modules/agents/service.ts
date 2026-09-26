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
import { and, eq } from "drizzle-orm";
import { generateAgentKey } from "../../agent-key";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import { recordAudit } from "../audit/service";
import { toAgent, toPolicy } from "./dto";
import {
  loadPolicyTexts,
  policyRecords,
  publishPolicyRecords,
  readAgentEns,
} from "./ens";
import { policyChange, policyFromTexts } from "./published";
import { agents, policies } from "./schema";

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === "23505") {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** An agent belongs to the owner who created it. The key is returned once. */
export async function createAgent(
  name: string,
  userId: string,
): Promise<Success<{ agent: Agent; key: string }> | Failure> {
  const { key, hash } = generateAgentKey();
  const agent: Agent = {
    id: crypto.randomUUID(),
    name,
    userId,
    hasKey: true,
    createdAt: new Date().toISOString(),
  };
  const createdAt = new Date(agent.createdAt);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(agents).values({
        id: agent.id,
        name: agent.name,
        userId,
        keyHash: hash,
        createdAt,
      });
      await recordAudit(tx, {
        agentId: agent.id,
        kind: "AGENT_CREATED",
        summary: `Created agent ${agent.name}.`,
        createdAt,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        error: `The name ${name} is taken. Pick another.`,
      };
    }
    throw error;
  }
  return { ok: true, value: { agent, key } };
}

/** Replaces the agent key. The new key is returned once; the old one stops working. */
export async function issueAgentKey(
  agentId: string,
  userId: string,
): Promise<Success<{ key: string }> | Failure> {
  const agent = await getOwnedAgent(agentId, userId);
  if (!agent) {
    return { ok: false, status: 404, error: "Agent not found." };
  }
  const { key, hash } = generateAgentKey();
  const createdAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({ keyHash: hash })
      .where(and(eq(agents.id, agentId), eq(agents.userId, userId)));
    await recordAudit(tx, {
      agentId,
      kind: "AGENT_KEY_ISSUED",
      summary: agent.hasKey
        ? "Replaced the agent key. The previous key no longer works."
        : "Created the agent key.",
      createdAt,
    });
  });
  return { ok: true, value: { key } };
}

export async function listAgents(userId: string): Promise<Agent[]> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(agents.createdAt);
  return rows.map(toAgent);
}

/** Any agent, for the agent-facing and settle paths. Owner routes use `getOwnedAgent`. */
export async function getAgent(agentId: string): Promise<Agent | undefined> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  const row = rows[0];
  return row ? toAgent(row) : undefined;
}

/** Another owner's agent reads as missing. */
export async function getOwnedAgent(
  agentId: string,
  userId: string,
): Promise<Agent | undefined> {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
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
  userId: string,
  input: {
    autonomousLimit: string;
    hardLimit: string;
    dailyLimit?: string;
    allowedActions?: ActionType[];
    allowedTargets?: string[];
  },
): Promise<Success<Policy> | Failure> {
  const agent = await getOwnedAgent(agentId, userId);
  if (!agent) {
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

  const identity = await readAgentEns(agent.name);
  if (identity.status === "UNAVAILABLE") {
    return {
      ok: false,
      status: 503,
      error: identity.detail ?? "ENS name could not be read.",
    };
  }
  if (identity.status === "REGISTERED" && identity.name) {
    const published = policyFromTexts(
      agentId,
      await loadPolicyTexts(identity.name),
    );
    const change = published ? policyChange(published, policy) : "tighter";
    if (change === "looser") {
      return {
        ok: false,
        status: 400,
        error:
          "Raising a limit or adding a permission is not published to the name yet.",
      };
    }
    if (change === "tighter") {
      try {
        await publishPolicyRecords(agent.name, policyRecords(policy));
      } catch (error) {
        return {
          ok: false,
          status: 503,
          error:
            error instanceof Error
              ? error.message
              : "ENS policy publish failed.",
        };
      }
    }
  }

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

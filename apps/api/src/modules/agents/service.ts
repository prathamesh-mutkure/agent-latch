import {
  type ActionType,
  type Agent,
  actionTypes,
  type Policy,
  parseUsdc,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "@agentlatch/core";
import { memory } from "../../memory";
import type { Failure, Success } from "../../result";

export function createAgent(name: string): Agent {
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  memory.agents.set(agent.id, agent);
  return agent;
}

export function listAgents(): Agent[] {
  return [...memory.agents.values()];
}

export function getAgent(agentId: string): Agent | undefined {
  return memory.agents.get(agentId);
}

export function getPolicy(agentId: string): Policy | undefined {
  return memory.policies.get(agentId);
}

export function setPolicy(
  agentId: string,
  input: {
    autonomousLimit: string;
    hardLimit: string;
    dailyLimit?: string;
    allowedActions?: ActionType[];
    allowedTargets?: string[];
  },
): Success<Policy> | Failure {
  if (!memory.agents.has(agentId)) {
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

  const policy: Policy = {
    agentId,
    autonomousLimit: autonomous.toString(),
    hardLimit: hard.toString(),
    dailyLimit: daily === null ? null : daily.toString(),
    allowedActions,
    allowedTokens: [USDC_SEPOLIA_ADDRESS.toLowerCase()],
    allowedTargets: (input.allowedTargets ?? []).map((target) => target.trim()),
    updatedAt: new Date().toISOString(),
  };
  memory.policies.set(agentId, policy);
  return { ok: true, value: policy };
}

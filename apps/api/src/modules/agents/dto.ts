import type { ActionType, Agent, Policy } from "@agentlatch/core";
import { formatUsdc } from "@agentlatch/core";
import type { agents, policies } from "./schema";

type AgentRow = typeof agents.$inferSelect;
type PolicyRow = typeof policies.$inferSelect;

export function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    hasKey: row.keyHash !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPolicy(row: PolicyRow): Policy {
  return {
    agentId: row.agentId,
    autonomousLimit: row.autonomousLimit,
    hardLimit: row.hardLimit,
    dailyLimit: row.dailyLimit,
    allowedActions: row.allowedActions as ActionType[],
    allowedTokens: row.allowedTokens,
    allowedTargets: row.allowedTargets,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PolicyDto = {
  agentId: string;
  autonomousLimitUsdc: string;
  hardLimitUsdc: string;
  dailyLimitUsdc: string | null;
  allowedActions: ActionType[];
  allowedTokens: string[];
  allowedTargets: string[];
  updatedAt: string;
};

export function toPolicyDto(policy: Policy): PolicyDto {
  return {
    agentId: policy.agentId,
    autonomousLimitUsdc: formatUsdc(policy.autonomousLimit),
    hardLimitUsdc: formatUsdc(policy.hardLimit),
    dailyLimitUsdc:
      policy.dailyLimit === null ? null : formatUsdc(policy.dailyLimit),
    allowedActions: policy.allowedActions,
    allowedTokens: policy.allowedTokens,
    allowedTargets: policy.allowedTargets,
    updatedAt: policy.updatedAt,
  };
}

import type { SimulatedExecution } from "@agentlatch/core";
import { memory } from "./memory";

/** Records that an already-authorized action ran. Does not hold a key or sign. */
export function saveExecution(
  actionRequestId: string,
  now: Date,
): SimulatedExecution {
  const execution: SimulatedExecution = {
    id: crypto.randomUUID(),
    actionRequestId,
    executedAt: now.toISOString(),
    signed: false,
  };
  memory.executions.set(execution.id, execution);
  return execution;
}

export function getExecution(
  executionId: string,
): SimulatedExecution | undefined {
  return memory.executions.get(executionId);
}

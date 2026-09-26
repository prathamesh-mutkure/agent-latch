import type { SimulatedExecution } from "@agentlatch/core";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { db } from "./db/client";
import { executions } from "./modules/actions/schema";

/** Records that an already-authorized action ran. Does not hold a key or sign. */
export async function saveExecution(
  tx: Db,
  actionRequestId: string,
  now: Date,
): Promise<SimulatedExecution> {
  const execution: SimulatedExecution = {
    id: crypto.randomUUID(),
    actionRequestId,
    executedAt: now.toISOString(),
    signed: false,
  };
  await tx.insert(executions).values({
    id: execution.id,
    actionRequestId,
    executedAt: now,
    signed: false,
  });
  return execution;
}

export async function getExecution(
  executionId: string,
): Promise<SimulatedExecution | undefined> {
  const rows = await db
    .select()
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    actionRequestId: row.actionRequestId,
    executedAt: row.executedAt.toISOString(),
    signed: false,
  };
}

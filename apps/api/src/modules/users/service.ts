import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import type { Owner } from "../../session";
import { agents } from "../agents/schema";
import { type ApprovalDto, toApprovalDto } from "../approvals/dto";
import { listOwnerApprovals } from "../approvals/service";
import { users } from "./schema";

export type User = {
  id: string;
  createdAt: string;
  worldWallet: string;
};

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    worldWallet: row.worldWallet,
  };
}

/** One owner per World App wallet. Signing in again returns the same row. */
export async function upsertUserByWallet(worldWallet: string): Promise<User> {
  const wallet = worldWallet.toLowerCase();
  const inserted = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      worldWallet: wallet,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: users.worldWallet })
    .returning();
  const row =
    inserted[0] ??
    (
      await db
        .select()
        .from(users)
        .where(eq(users.worldWallet, wallet))
        .limit(1)
    )[0];
  if (!row) {
    throw new Error("User upsert returned no row.");
  }
  return toUser(row);
}

export type Account = {
  wallet: string;
  agentIds: string[];
  pending: ApprovalDto[];
};

/** The signed-in owner's agents and what waits on them. Undefined once the user row is gone. */
export async function getAccount(owner: Owner): Promise<Account | undefined> {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, owner.userId))
    .limit(1);
  if (!found[0]) {
    return undefined;
  }
  const owned = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.userId, owner.userId))
    .orderBy(agents.createdAt);
  const pending = await listOwnerApprovals(owner.userId);
  return {
    wallet: owner.wallet,
    agentIds: owned.map((row) => row.id),
    pending: pending.map(toApprovalDto),
  };
}

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import type { Owner } from "../../session";
import { parentName } from "../agents/ens";
import { agents } from "../agents/schema";
import { type ApprovalDto, toApprovalDto } from "../approvals/dto";
import { listOwnerApprovals } from "../approvals/service";
import { users } from "./schema";

export type User = {
  id: string;
  createdAt: string;
  worldWallet: string;
  username: string | null;
};

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    worldWallet: row.worldWallet,
    username: row.username,
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
  /** ENS label new agents are created under. Null until the owner sets it. */
  username: string | null;
  /** ENS parent agents are named under, for example `agent-latch.eth`. */
  ensParent: string;
  agentIds: string[];
  pending: ApprovalDto[];
};

/** The signed-in owner's agents and what waits on them. Undefined once the user row is gone. */
export async function getAccount(owner: Owner): Promise<Account | undefined> {
  const found = await db
    .select({ id: users.id, username: users.username })
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
    username: found[0].username,
    ensParent: parentName(),
    agentIds: owned.map((row) => row.id),
    pending: pending.map(toApprovalDto),
  };
}

/**
 * Sets the owner's username once. Agents created after it live under
 * `username.<parent>`. Agents created before keep their name.
 */
export async function setUsername(
  owner: Owner,
  username: string,
): Promise<Success<Account> | Failure> {
  const taken = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (taken[0] && taken[0].id !== owner.userId) {
    return { ok: false, status: 409, error: "That username is taken." };
  }
  if (!taken[0]) {
    const updated = await db
      .update(users)
      .set({ username })
      .where(and(eq(users.id, owner.userId), isNull(users.username)))
      .returning({ id: users.id });
    if (!updated[0]) {
      return {
        ok: false,
        status: 409,
        error: "Your username is already set.",
      };
    }
  }
  const account = await getAccount(owner);
  if (!account) {
    return { ok: false, status: 401, error: "Sign in with World App." };
  }
  return { ok: true, value: account };
}

import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import { users } from "./schema";

export type User = {
  id: string;
  createdAt: string;
  worldWallet: string | null;
};

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    worldWallet: row.worldWallet,
  };
}

function uniqueViolation(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    return true;
  }
  if (error instanceof Error && "cause" in error) {
    return uniqueViolation(error.cause);
  }
  return false;
}

/** One row per World identity. Signing in twice returns the same row. */
export async function upsertUser(iss: string, sub: string): Promise<User> {
  const inserted = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      worldIss: iss,
      worldSub: sub,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: [users.worldIss, users.worldSub] })
    .returning();
  const row =
    inserted[0] ??
    (
      await db
        .select()
        .from(users)
        .where(and(eq(users.worldIss, iss), eq(users.worldSub, sub)))
        .limit(1)
    )[0];
  if (!row) {
    throw new Error("User upsert returned no row.");
  }
  return toUser(row);
}

export async function getUser(userId: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  return row ? toUser(row) : undefined;
}

/** Saves the World App wallet that notifications are addressed to. */
export async function linkWallet(
  userId: string,
  worldWallet: string,
): Promise<Success<User> | Failure> {
  try {
    const rows = await db
      .update(users)
      .set({ worldWallet })
      .where(eq(users.id, userId))
      .returning();
    const row = rows[0];
    if (!row) {
      return { ok: false, status: 401, error: "Not signed in." };
    }
    return { ok: true, value: toUser(row) };
  } catch (error) {
    if (uniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        error: "This World App wallet is already linked to another owner.",
      };
    }
    throw error;
  }
}

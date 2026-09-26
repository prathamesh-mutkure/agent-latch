import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "./schema";

export type User = { id: string; createdAt: string };

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
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

export async function getUser(userId: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  return row
    ? { id: row.id, createdAt: row.createdAt.toISOString() }
    : undefined;
}

import { eq } from "drizzle-orm";
import { db } from "../../db/client";
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

/** One owner per World App wallet. Linking twice returns the same row. */
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
  const row = inserted[0] ?? (await getUserRow(wallet));
  if (!row) {
    throw new Error("User upsert returned no row.");
  }
  return toUser(row);
}

async function getUserRow(worldWallet: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.worldWallet, worldWallet.toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function getUserByWallet(
  worldWallet: string,
): Promise<User | undefined> {
  const row = await getUserRow(worldWallet);
  return row ? toUser(row) : undefined;
}

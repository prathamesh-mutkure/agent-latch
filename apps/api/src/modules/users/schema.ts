import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    /** World App wallet, lower case. Receives pushes and signs every decision. */
    worldWallet: text("world_wallet").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique("users_world_wallet").on(table.worldWallet)],
);

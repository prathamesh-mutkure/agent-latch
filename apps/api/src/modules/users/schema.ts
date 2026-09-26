import {
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    /** World App wallet, lower case. Receives pushes and signs every decision. */
    worldWallet: text("world_wallet").notNull(),
    /** ENS label under the parent. Agents created after it is set live under it. */
    username: text("username"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("users_world_wallet").on(table.worldWallet),
    uniqueIndex("users_username").on(table.username),
  ],
);

import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    worldIss: text("world_iss").notNull(),
    worldSub: text("world_sub").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** World App wallet that receives mini-app notifications. Null until linked. */
    worldWallet: text("world_wallet"),
  },
  (table) => [
    unique("users_world_identity").on(table.worldIss, table.worldSub),
    unique("users_world_wallet").on(table.worldWallet),
  ],
);

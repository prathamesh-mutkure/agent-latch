import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../users/schema";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey(),
    /** ENS label under the parent name, so unique across every owner. */
    name: text("name").notNull(),
    /** Owner's ENS label: the agent id is `name.username.<parent>`. */
    username: text("username"),
    /** Lower case. The key the agent signs requests with. */
    authAddress: text("auth_address"),
    /** Owner who approves this agent's exceptional actions. */
    userId: uuid("user_id").references(() => users.id),
    /** SHA-256 of the agent key. The key itself is shown once and never stored. */
    keyHash: text("key_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("agents_name_unique").on(sql`lower(${table.name})`),
    uniqueIndex("agents_username_name").on(table.username, table.name),
  ],
);

export const policies = pgTable("policies", {
  agentId: uuid("agent_id")
    .primaryKey()
    .references(() => agents.id, { onDelete: "cascade" }),
  autonomousLimit: text("autonomous_limit").notNull(),
  hardLimit: text("hard_limit").notNull(),
  dailyLimit: text("daily_limit"),
  allowedActions: text("allowed_actions").array().notNull(),
  allowedTokens: text("allowed_tokens").array().notNull(),
  allowedTargets: text("allowed_targets").array().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

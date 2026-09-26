import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

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

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "../agents/schema";

export const executions = pgTable("executions", {
  id: uuid("id").primaryKey(),
  actionRequestId: uuid("action_request_id").notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
  signed: boolean("signed").notNull().default(false),
});

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    target: text("target").notNull(),
    token: text("token").notNull(),
    amount: text("amount").notNull(),
    nonce: text("nonce").notNull(),
    note: text("note"),
    status: text("status").notNull(),
    decision: text("decision").notNull(),
    reasons: text("reasons").array().notNull(),
    approvalRequestId: uuid("approval_request_id"),
    executionId: uuid("execution_id").references(() => executions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("actions_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

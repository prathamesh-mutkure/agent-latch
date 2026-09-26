import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { actions } from "../actions/schema";
import { agents } from "../agents/schema";

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    actionRequestId: uuid("action_request_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    amount: text("amount").notNull(),
    token: text("token").notNull(),
    target: text("target").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    nonce: text("nonce").notNull(),
    /** sha256 of the exact action. Sent to World as the step-up nonce. */
    bindingHash: text("binding_hash"),
    stepUpStartedAt: timestamp("step_up_started_at", { withTimezone: true }),
    worldAuthTime: timestamp("world_auth_time", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    index("approvals_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

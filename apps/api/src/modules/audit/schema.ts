import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { actions } from "../actions/schema";
import { agents } from "../agents/schema";
import { approvals } from "../approvals/schema";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    actionRequestId: uuid("action_request_id").references(() => actions.id, {
      onDelete: "cascade",
    }),
    approvalId: uuid("approval_id").references(() => approvals.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("audit_events_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
    /** sha256 of the exact action. The World App decision nonce is derived from it. */
    bindingHash: text("binding_hash"),
    /** World App wallet that signed the approve or deny. */
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    /** Status of the latest World ID check, copied from `world_id_checks`. */
    worldIdStatus: text("world_id_status"),
    worldIdError: text("world_id_error"),
  },
  (table) => [
    index("approvals_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

/** World ID for Agents device checks. Approve runs the action only after one verifies. */
export const worldIdChecks = pgTable(
  "world_id_checks",
  {
    id: uuid("id").primaryKey(),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => approvals.id, { onDelete: "cascade" }),
    /** World App wallet that signed Approve and started this check. */
    wallet: text("wallet").notNull(),
    /** The approval's binding hash when the check started. */
    bindingHash: text("binding_hash").notNull(),
    /** Redeemable with the client secret. Never leaves the API; cleared when the check ends. */
    deviceCode: text("device_code"),
    userCode: text("user_code").notNull(),
    verificationUrl: text("verification_url").notNull(),
    pollInterval: integer("poll_interval").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    /** Pairwise World ID subject from the validated token. Never returned by the API. */
    subject: text("subject"),
    authTime: timestamp("auth_time", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("world_id_checks_approval_idx").on(table.approvalId, table.startedAt),
  ],
);

CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"token" text NOT NULL,
	"amount" text NOT NULL,
	"nonce" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"decision" text NOT NULL,
	"reasons" text[] NOT NULL,
	"approval_request_id" uuid,
	"execution_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"action_request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"amount" text NOT NULL,
	"token" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"nonce" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid,
	"action_request_id" uuid,
	"approval_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action_request_id" uuid NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"signed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"autonomous_limit" text NOT NULL,
	"hard_limit" text NOT NULL,
	"daily_limit" text,
	"allowed_actions" text[] NOT NULL,
	"allowed_tokens" text[] NOT NULL,
	"allowed_targets" text[] NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_action_request_id_actions_id_fk" FOREIGN KEY ("action_request_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_request_id_actions_id_fk" FOREIGN KEY ("action_request_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_agent_created_idx" ON "actions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_agent_created_idx" ON "approvals" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_agent_created_idx" ON "audit_events" USING btree ("agent_id","created_at");
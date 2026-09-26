CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_iss" text NOT NULL,
	"world_sub" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_world_identity" UNIQUE("world_iss","world_sub")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "binding_hash" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "step_up_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "world_auth_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "world_id_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"approval_id" uuid NOT NULL,
	"wallet" text NOT NULL,
	"binding_hash" text NOT NULL,
	"device_code" text,
	"user_code" text NOT NULL,
	"verification_url" text NOT NULL,
	"poll_interval" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"subject" text,
	"auth_time" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "world_id_checks" ADD CONSTRAINT "world_id_checks_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_id_checks_approval_idx" ON "world_id_checks" USING btree ("approval_id","started_at");--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "world_id_status" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "world_id_error" text;

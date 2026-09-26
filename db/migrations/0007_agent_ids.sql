ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username" ON "users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "auth_address" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_username_name" ON "agents" USING btree ("username","name");

ALTER TABLE "users" ADD COLUMN "world_wallet" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_world_wallet" UNIQUE("world_wallet");

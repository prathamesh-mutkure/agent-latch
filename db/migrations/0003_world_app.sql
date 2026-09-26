UPDATE "agents" SET "user_id" = NULL WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "world_wallet" IS NULL);--> statement-breakpoint
DELETE FROM "users" WHERE "world_wallet" IS NULL;--> statement-breakpoint
UPDATE "users" SET "world_wallet" = lower("world_wallet");--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_world_identity";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "world_iss";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "world_sub";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "world_wallet" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" DROP COLUMN "step_up_started_at";--> statement-breakpoint
ALTER TABLE "approvals" RENAME COLUMN "world_auth_time" TO "decided_at";--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "decided_by" text;

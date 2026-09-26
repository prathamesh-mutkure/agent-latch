import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../env";

export async function applyMigrations(): Promise<void> {
  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(migrationClient), {
      migrationsFolder: resolve(import.meta.dir, "../../../../db/migrations"),
    });
  } finally {
    await migrationClient.end();
  }
}

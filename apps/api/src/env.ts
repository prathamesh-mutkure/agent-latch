import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(import.meta.dir, "../../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/agentlatch";

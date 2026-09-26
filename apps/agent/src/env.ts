import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(import.meta.dir, "../../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export const apiUrl = process.env.API_URL ?? "http://localhost:3001";
export const agentName = process.env.AGENT_NAME ?? "trader";
export const intervalMs = Number(process.env.AGENT_INTERVAL_MS ?? 10_000);
export const pollMs = Number(process.env.AGENT_POLL_MS ?? 2_000);

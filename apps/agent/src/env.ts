import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(import.meta.dir, "../../../.env");
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const apiUrl = process.env.API_URL ?? "http://localhost:3001";
export const agentName = process.env.AGENT_NAME ?? "trader";
export const intervalMs = Number(process.env.AGENT_INTERVAL_MS ?? 10_000);
export const pollMs = Number(process.env.AGENT_POLL_MS ?? 2_000);

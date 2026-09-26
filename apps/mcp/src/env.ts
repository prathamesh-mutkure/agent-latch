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
/**
 * The agent this server pays as. `AGENTLATCH_AGENT_ID` wins, then `AGENT_ID`
 * (the same id the background agent uses). Names are not looked up: listing
 * agents requires the owner's session.
 */
export const agentId =
  process.env.AGENTLATCH_AGENT_ID || process.env.AGENT_ID || undefined;

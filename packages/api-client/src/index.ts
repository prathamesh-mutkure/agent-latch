import type { App } from "@agentlatch/api";
import { treaty } from "@elysiajs/eden";

const API_URL = "http://localhost:3001";

export function createAgentLatchClient(
  url = API_URL,
  headers?: Record<string, string>,
) {
  return treaty<App>(url, {
    headers,
    fetch: { cache: "no-store" },
    parseDate: false,
  });
}

export type AgentLatchClient = ReturnType<typeof createAgentLatchClient>;

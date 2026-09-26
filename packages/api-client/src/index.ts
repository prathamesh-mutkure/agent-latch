import type { App } from "@agentlatch/api";
import { treaty } from "@elysiajs/eden";

const API_URL = "http://localhost:3001";

export function createAgentLatchClient(url = API_URL) {
  return treaty<App>(url, {
    fetch: { cache: "no-store" },
    parseDate: false,
  });
}

export type AgentLatchClient = ReturnType<typeof createAgentLatchClient>;

import type { App } from "@agentlatch/api";
import { treaty } from "@elysiajs/eden";

const API_URL = "http://localhost:3001";

/** A function runs before every request, so a new sign-in applies right away. */
export function createAgentLatchClient(
  url = API_URL,
  headers?: Record<string, string> | (() => Record<string, string>),
) {
  return treaty<App>(url, {
    headers,
    fetch: { cache: "no-store" },
    parseDate: false,
  });
}

export type AgentLatchClient = ReturnType<typeof createAgentLatchClient>;

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { agents } from "./modules/agents/schema";
import type { Failure, Success } from "./result";
import { readSession } from "./session";

/** Header the agent and the MCP server send. Separate from the owner's bearer token. */
export const AGENT_KEY_HEADER = "x-agent-key";

export function generateAgentKey(): { key: string; hash: string } {
  const key = `alk_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashAgentKey(key) };
}

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function keysMatch(presented: string, hash: string): boolean {
  const given = Buffer.from(hashAgentKey(presented), "utf8");
  const expected = Buffer.from(hash, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type AccessHeaders = {
  authorization?: string;
  [AGENT_KEY_HEADER]?: string;
};

/**
 * `key` is the agent and the MCP server: the header must match the stored hash.
 * `owner-or-key` also allows the owner's session, so the dashboard can read.
 */
export async function readAgentAccess(
  agentId: string,
  headers: AccessHeaders,
  mode: "key" | "owner-or-key",
): Promise<Success<true> | Failure> {
  const rows = await db
    .select({ userId: agents.userId, keyHash: agents.keyHash })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  const agent = rows[0];
  if (!agent) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  const presented = headers[AGENT_KEY_HEADER]?.trim();
  if (presented && agent.keyHash && keysMatch(presented, agent.keyHash)) {
    return { ok: true, value: true };
  }

  const owner = readSession(headers.authorization);
  if (mode === "owner-or-key" && owner && owner.userId === agent.userId) {
    return { ok: true, value: true };
  }
  if (owner && owner.userId !== agent.userId && !presented) {
    return { ok: false, status: 404, error: "Agent not found." };
  }
  if (!agent.keyHash) {
    return {
      ok: false,
      status: 401,
      error:
        "This agent has no key yet. Create one on its page in the dashboard.",
    };
  }
  return { ok: false, status: 401, error: "This agent's key was refused." };
}

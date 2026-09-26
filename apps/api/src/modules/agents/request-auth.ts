import {
  AGENT_ID_HEADER,
  AGENT_NONCE_HEADER,
  AGENT_REQUEST_WINDOW_SECONDS,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
  type Agent,
  agentRequestMessage,
  sha256Hex,
} from "@agentlatch/core";
import { verifyMessage } from "viem";
import type { Failure } from "../../result";
import { agentEnsName } from "./ens";

const rawBodies = new WeakMap<Request, string>();

// ponytail: in memory, so a restart or a second API process accepts a replay
// inside the window. Move to Postgres when the API runs more than one process.
const seenNonces = new Map<string, number>();

/** Route `parse` hook: keeps the raw body, since the signature covers its bytes. */
export async function parseJsonKeepingRaw({
  request,
}: {
  request: Request;
}): Promise<unknown> {
  const text = await request.text();
  rawBodies.set(request, text);
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function denied(error: string): Failure {
  return { ok: false, status: 401, error };
}

/**
 * An agent with an auth address must sign the request with that key. Agents
 * without one, created before signed requests, are let through unsigned.
 */
export async function verifyAgentRequest(
  request: Request,
  agent: Agent,
  now = Date.now(),
): Promise<Failure | null> {
  if (!agent.authAddress) {
    return null;
  }
  const agentId = request.headers.get(AGENT_ID_HEADER)?.toLowerCase();
  const timestamp = request.headers.get(AGENT_TIMESTAMP_HEADER);
  const nonce = request.headers.get(AGENT_NONCE_HEADER);
  const signature = request.headers.get(AGENT_SIGNATURE_HEADER);
  if (!agentId || !timestamp || !nonce || !signature) {
    return denied("This agent must sign its requests.");
  }
  if (agentId !== agentEnsName(agent)) {
    return denied("Signed agent id does not match this agent.");
  }
  const seconds = Number(timestamp);
  if (
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - seconds) > AGENT_REQUEST_WINDOW_SECONDS
  ) {
    return denied("Signed request is outside the time window.");
  }
  if (
    !/^[0-9a-zA-Z-]{8,64}$/.test(nonce) ||
    !/^0x[0-9a-f]+$/i.test(signature)
  ) {
    return denied("Signed request headers are malformed.");
  }
  const key = `${agent.id}:${nonce}`;
  if (seenNonces.has(key)) {
    return denied("Signed request was already used.");
  }
  const url = new URL(request.url);
  const message = agentRequestMessage({
    agentId,
    method: request.method,
    path: `${url.pathname}${url.search}`,
    timestamp,
    nonce,
    bodySha256: await sha256Hex(rawBodies.get(request) ?? ""),
  });
  const valid = await verifyMessage({
    address: agent.authAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) {
    return denied("Agent signature does not match its auth address.");
  }
  for (const [seen, expiresAt] of seenNonces) {
    if (expiresAt <= now) {
      seenNonces.delete(seen);
    }
  }
  seenNonces.set(key, (seconds + AGENT_REQUEST_WINDOW_SECONDS) * 1000);
  return null;
}

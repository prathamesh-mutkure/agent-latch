/**
 * Agent request signing. An agent proves it holds its ENS agent id by signing
 * each request (EIP-191) with the key whose address is that name's ETH record.
 */
export const AGENT_ID_HEADER = "x-agentlatch-agent";
export const AGENT_TIMESTAMP_HEADER = "x-agentlatch-timestamp";
export const AGENT_NONCE_HEADER = "x-agentlatch-nonce";
export const AGENT_SIGNATURE_HEADER = "x-agentlatch-signature";

/** Seconds a signed request stays valid on either side of the API clock. */
export const AGENT_REQUEST_WINDOW_SECONDS = 60;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The exact text an agent signs. Path includes the query string. */
export function agentRequestMessage(input: {
  agentId: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}): string {
  return [
    "AgentLatch agent request",
    `agent: ${input.agentId.toLowerCase()}`,
    `method: ${input.method.toUpperCase()}`,
    `path: ${input.path}`,
    `timestamp: ${input.timestamp}`,
    `nonce: ${input.nonce}`,
    `body: ${input.bodySha256}`,
  ].join("\n");
}

/** Agent ids are lowercase ENS labels, for example `trader.alice.agent-latch.eth`. */
export function isEnsLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

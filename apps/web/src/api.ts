import {
  type AgentLatchClient,
  createAgentLatchClient,
} from "@agentlatch/api-client";
import type { SignedWalletAuth } from "./world";

// Same origin as the page. Vite in dev, and Vercel in production, proxy /api
// to the API. Every call is a fetch with this header, so the free ngrok tunnel
// returns JSON instead of its browser warning page.
const tunnelHeaders = { "ngrok-skip-browser-warning": "1" };

export const client: AgentLatchClient = createAgentLatchClient(
  `${window.location.origin}/api`,
  tunnelHeaders,
);

type CallResult<T> = {
  data: T | null;
  error: { status: unknown; value: unknown } | null;
  status: number;
};

function failureMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (value && typeof value === "object" && "error" in value) {
    const message = value.error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Request failed.";
}

async function read<T>(pending: Promise<CallResult<T>>): Promise<T> {
  const result = await pending;
  if (result.error || result.status >= 400) {
    throw new Error(failureMessage(result.error?.value));
  }
  if (result.data == null) {
    throw new Error("Empty response.");
  }
  return result.data;
}

export function getHealth() {
  return read(client.health.get());
}

export async function listAgents() {
  const data = await read(client.agents.get());
  if (!Array.isArray(data)) {
    throw new Error("Agents response was not a list.");
  }
  return data;
}

export async function listApprovals() {
  const data = await read(client.approvals.get());
  if (!Array.isArray(data)) {
    throw new Error("Approvals response was not a list.");
  }
  return data;
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
}

export async function listActions(agentId: string) {
  const data = await read(client.agents({ agentId }).actions.get());
  if (isErrorBody(data) || !Array.isArray(data)) {
    throw new Error(
      isErrorBody(data) ? data.error : "Unexpected actions response.",
    );
  }
  return data;
}

export async function listAudit(agentId: string) {
  const data = await read(client.agents({ agentId }).audit.get());
  if (isErrorBody(data) || !Array.isArray(data)) {
    throw new Error(
      isErrorBody(data) ? data.error : "Unexpected audit response.",
    );
  }
  return data;
}

export async function getPolicy(agentId: string) {
  const result = await client.agents({ agentId }).policy.get();
  if (result.status === 404) {
    return null;
  }
  const data = await read(Promise.resolve(result));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export async function getApproval(approvalId: string) {
  const data = await read(client.approvals({ approvalId }).get());
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export type Decision = "approve" | "deny";

export function getWorldConfig() {
  return read(client.world.config.get());
}

export async function worldNonce(): Promise<string> {
  const data = await read(client.world.nonce.get());
  return data.nonce;
}

/** Links the World App wallet that signed. With `agentId`, also claims that agent. */
export async function linkWorldApp(body: {
  nonce: string;
  agentId?: string;
  payload: SignedWalletAuth;
}) {
  const data = await read(client.world.link.post(body));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export function getOwner(wallet: string) {
  return read(client.world.owner({ wallet }).get());
}

/** What World App must sign to approve or deny this one approval. */
export async function getDecisionChallenge(
  approvalId: string,
  decision: Decision,
) {
  const data = await read(
    client.approvals({ approvalId }).challenge.get({ query: { decision } }),
  );
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Sends the signed decision. Deny ends the approval. Approve returns the World
 * ID for Agents check to finish; the action runs after World ID verifies it.
 */
export async function decideApproval(
  approvalId: string,
  decision: Decision,
  payload: SignedWalletAuth,
) {
  const data = await read(
    client.approvals({ approvalId }).decide.post({ decision, payload }),
  );
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export type DecisionOutcome = Awaited<ReturnType<typeof decideApproval>>;
export type WorldIdPrompt = Extract<
  DecisionOutcome,
  { result: "verify" }
>["worldId"];

export type AgentRecord = Awaited<ReturnType<typeof listAgents>>[number];
export type ApprovalRecord = Awaited<ReturnType<typeof listApprovals>>[number];
export type ActionRecord = Awaited<ReturnType<typeof listActions>>[number];
export type AuditRecord = Awaited<ReturnType<typeof listAudit>>[number];
export type PolicyRecord = NonNullable<Awaited<ReturnType<typeof getPolicy>>>;

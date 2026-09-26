import {
  type AgentLatchClient,
  createAgentLatchClient,
} from "@agentlatch/api-client";
import type { ActionType } from "@agentlatch/core";
import { clearSession, currentSession } from "./session";
import type { SignedWalletAuth } from "./world";

// Same origin as the page. Vite in dev, and Vercel in production, proxy /api
// to the API.
export const client: AgentLatchClient = createAgentLatchClient(
  `${window.location.origin}/api`,
  (): Record<string, string> => {
    const session = currentSession();
    return session ? { authorization: `Bearer ${session.token}` } : {};
  },
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
  if (result.status === 401) {
    clearSession();
  }
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

export type NewAgent = {
  name: string;
  /** The agent's own signing address. Becomes the name's ETH record. */
  authAddress?: string;
  policy: {
    autonomousLimit: string;
    hardLimit: string;
    dailyLimit?: string;
    allowedActions: ActionType[];
    allowedTargets: string[];
  };
};

export async function createAgent(input: NewAgent): Promise<{
  id: string;
  key: string;
  setupError: string | null;
}> {
  const data: unknown = await read(client.agents.post(input));
  if (
    typeof data !== "object" ||
    data === null ||
    !("id" in data && "key" in data) ||
    typeof data.id !== "string" ||
    typeof data.key !== "string"
  ) {
    throw new Error("Agent was not created.");
  }
  return {
    id: data.id,
    key: data.key,
    setupError:
      "setupError" in data && typeof data.setupError === "string"
        ? data.setupError
        : null,
  };
}

/** Sets the owner's username once. New agents are named under it. */
export async function setUsername(username: string) {
  const data = await read(client.me.username.put({ username }));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export async function issueAgentKey(agentId: string): Promise<{ key: string }> {
  const data: unknown = await read(client.agents({ agentId }).key.post());
  if (
    typeof data !== "object" ||
    data === null ||
    !("key" in data) ||
    typeof data.key !== "string"
  ) {
    throw new Error("Key was not created.");
  }
  return { key: data.key };
}

export async function registerAgentEns(agentId: string) {
  const data = await read(client.agents({ agentId }).ens.post({}));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
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

/** Signs in with the World App wallet that signed. The first sign-in creates the account. */
export async function worldSignIn(body: {
  nonce: string;
  payload: SignedWalletAuth;
}) {
  const data = await read(client.world["sign-in"].post(body));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

/** The signed-in owner's agents and pending approvals. */
export async function getAccount() {
  const data = await read(client.me.get());
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

/** Desktop sign-in: a code for the QR, and the secret only this browser keeps. */
export function startPairing() {
  return read(client.world.pair.post());
}

/** Polled by the computer until World App signs its code. */
export async function collectPairing(code: string, secret: string) {
  const data = await read(client.world.pair({ code }).session.post({ secret }));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

/** What World App signs to sign the computer in. */
export async function getPairingChallenge(code: string) {
  const data = await read(client.world.pair({ code }).get());
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

/** World App signed the code. Signs this phone in too. */
export async function confirmPairing(
  code: string,
  body: { nonce: string; payload: SignedWalletAuth },
) {
  const data = await read(client.world.pair({ code }).post(body));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
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

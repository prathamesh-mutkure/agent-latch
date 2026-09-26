import {
  type AgentLatchClient,
  createAgentLatchClient,
} from "@agentlatch/api-client";

// Same origin as the page: Vite proxies /api to the API, so the World session
// cookie is first-party and sent with every call.
export const client: AgentLatchClient = createAgentLatchClient(
  `${window.location.origin}/api`,
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

export function listAgents() {
  return read(client.agents.get());
}

export function listApprovals() {
  return read(client.approvals.get());
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

// Approve and deny are not API calls. Each is a full-page redirect to World ID:
// /auth/world/step-up?approval=:id&decision=approve|deny. The server applies
// the decision only after it checks the fresh World ID ticket.

export async function getMe() {
  const result = await client.me.get();
  if (result.status === 401) {
    return null;
  }
  const data = await read(Promise.resolve(result));
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export async function signOut() {
  await fetch("/auth/logout", { method: "POST" });
}

export async function claimAgent(agentId: string) {
  const data = await read(client.agents({ agentId }).claim.post());
  if (isErrorBody(data)) {
    throw new Error(data.error);
  }
  return data;
}

export type AgentRecord = Awaited<ReturnType<typeof listAgents>>[number];
export type ApprovalRecord = Awaited<ReturnType<typeof listApprovals>>[number];
export type ActionRecord = Awaited<ReturnType<typeof listActions>>[number];
export type AuditRecord = Awaited<ReturnType<typeof listAudit>>[number];
export type PolicyRecord = NonNullable<Awaited<ReturnType<typeof getPolicy>>>;

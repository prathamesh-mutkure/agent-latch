import {
  type AgentLatchClient,
  createAgentLatchClient,
} from "@agentlatch/api-client";

// Same origin as the page. Vite in dev, and Vercel in production, proxy /api
// and /auth to the API. The ngrok header is forwarded so the free tunnel
// returns JSON instead of its browser warning page.
const tunnelHeaders = { "ngrok-skip-browser-warning": "1" };

export const client: AgentLatchClient = createAgentLatchClient(
  `${window.location.origin}/api`,
  tunnelHeaders,
);

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("ngrok-skip-browser-warning", "1");
  return fetch(path, { ...init, headers });
}

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

// Approve and deny are full-page visits to
// /auth/world/step-up?approval=:id&decision=approve|deny. The API starts World
// ID, then the approve page polls until the human confirms on World's page.

export type StepUpStatus =
  | { phase: "idle" }
  | {
      phase: "waiting";
      humanUrl: string;
      connectorUri?: string;
      worldStatus: string;
    }
  | { phase: "done"; result: string };

export async function stepUpStatus(): Promise<StepUpStatus> {
  const response = await apiFetch("/auth/world/step-up/status");
  const body = (await response.json()) as StepUpStatus & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Could not check World ID.");
  }
  if (
    body.phase !== "idle" &&
    body.phase !== "waiting" &&
    body.phase !== "done"
  ) {
    throw new Error("World ID status was not recognized.");
  }
  return body;
}

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
  await apiFetch("/auth/logout", { method: "POST" });
}

export async function worldAppId(): Promise<string | null> {
  const response = await apiFetch("/auth/world/app");
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { appId?: string | null };
  return body.appId ?? null;
}

export async function worldNonce(): Promise<string> {
  const response = await apiFetch("/auth/world/nonce");
  const body = (await response.json()) as { nonce?: string; error?: string };
  if (!response.ok || !body.nonce) {
    throw new Error(body.error ?? "Could not start the wallet link.");
  }
  return body.nonce;
}

export async function saveWorldWallet(payload: {
  address: string;
  message: string;
  signature: string;
}): Promise<void> {
  const response = await apiFetch("/auth/world/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Could not link the World App wallet.");
  }
}

export async function listMyApprovals() {
  const data = await read(client.me.approvals.get());
  if (isErrorBody(data) || !Array.isArray(data)) {
    throw new Error(
      isErrorBody(data) ? data.error : "Unexpected approvals response.",
    );
  }
  return data;
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

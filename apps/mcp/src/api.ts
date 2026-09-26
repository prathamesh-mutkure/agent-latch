import { agentId, agentKey, apiUrl } from "./env";

export type Merchant = {
  id: string;
  name: string;
  description: string;
  url: string;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amountBaseUnits: string;
  facilitator: string;
};

export type Action = {
  id: string;
  agentId: string;
  action: string;
  target: string;
  amountUsdc: string;
  note: string | null;
  status: string;
  decision: "ALLOW" | "BLOCK" | "HUMAN_APPROVAL";
  reasons: string[];
  approvalRequestId: string | null;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(agentKey ? { "x-agent-key": agentKey } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ApiError(`AgentLatch API at ${apiUrl} did not answer.`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: string }
      | undefined;
    throw new ApiError(
      body?.error ?? `AgentLatch API answered ${response.status}.`,
    );
  }
  return response.json() as Promise<T>;
}

function currentAgentId(): string {
  if (!agentId) {
    throw new ApiError(
      "Set AGENTLATCH_AGENT_ID or AGENT_ID to the agent this server pays as.",
    );
  }
  if (!agentKey) {
    throw new ApiError(
      "Set AGENT_KEY to the key shown once on that agent's page.",
    );
  }
  return agentId;
}

export function listMerchants(): Promise<Merchant[]> {
  return request<Merchant[]>("/x402/merchants");
}

export async function submitPayment(input: {
  url: string;
  amountUsdc: string;
  note?: string;
}): Promise<Action> {
  const id = currentAgentId();
  return request<Action>(`/agents/${id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "X402_PAYMENT",
      target: input.url,
      amount: input.amountUsdc,
      note: input.note,
    }),
  });
}

export function getAction(actionId: string): Promise<Action> {
  currentAgentId();
  return request<Action>(`/actions/${actionId}`);
}

export function submitSwap(input: {
  amountUsdc: string;
  note?: string;
}): Promise<Action> {
  const id = currentAgentId();
  return request<Action>(`/agents/${id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "SWAP",
      target: "0xvenue",
      amount: input.amountUsdc,
      note: input.note,
    }),
  });
}

export type Approval = { id: string; status: string };

export function getApproval(approvalId: string): Promise<Approval> {
  return request<Approval>(`/approvals/${approvalId}`);
}

export function getPolicy(): Promise<unknown> {
  const id = currentAgentId();
  return request(`/agents/${id}/policy`);
}

export type AuditEvent = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
};

export async function recentActivity(): Promise<AuditEvent[]> {
  const id = currentAgentId();
  const events = await request<AuditEvent[]>(`/agents/${id}/audit`);
  return events.slice(-20);
}

export async function listPayments(): Promise<Action[]> {
  const id = currentAgentId();
  const actions = await request<Action[]>(`/agents/${id}/actions`);
  return actions.filter((action) => action.action === "X402_PAYMENT");
}

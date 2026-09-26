import { agentId, agentName, apiUrl } from "./env";

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

type AgentRecord = { id: string; name: string };

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
      headers: { "content-type": "application/json", ...init?.headers },
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

let resolvedAgentId: string | undefined = agentId;

/** The agent id, looked up once by name when no id is configured. */
async function currentAgentId(): Promise<string> {
  if (resolvedAgentId) {
    return resolvedAgentId;
  }
  const agents = await request<AgentRecord[]>("/agents");
  const agent = agents.find((candidate) => candidate.name === agentName);
  if (!agent) {
    throw new ApiError(`No AgentLatch agent named ${agentName}.`);
  }
  resolvedAgentId = agent.id;
  return agent.id;
}

export function listMerchants(): Promise<Merchant[]> {
  return request<Merchant[]>("/x402/merchants");
}

export async function submitPayment(input: {
  url: string;
  amountUsdc: string;
  note?: string;
}): Promise<Action> {
  const id = await currentAgentId();
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
  return request<Action>(`/actions/${actionId}`);
}

export async function listPayments(): Promise<Action[]> {
  const id = await currentAgentId();
  const actions = await request<Action[]>(`/agents/${id}/actions`);
  return actions.filter((action) => action.action === "X402_PAYMENT");
}

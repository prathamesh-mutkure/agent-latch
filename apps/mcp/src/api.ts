import {
  AGENT_ID_HEADER,
  AGENT_NONCE_HEADER,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
  agentRequestMessage,
  sha256Hex,
} from "@agentlatch/core";
import { UNISWAP_SWAP_OUTPUT } from "@agentlatch/uniswap-executor";
import { privateKeyToAccount } from "viem/accounts";
import {
  agentEnsName,
  agentId,
  agentKey,
  agentPrivateKey,
  apiUrl,
} from "./env";

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

/** ENS signature headers, or none when no signing key is configured. */
async function signedHeaders(
  method: string,
  path: string,
  body: string,
): Promise<Record<string, string>> {
  if (!agentPrivateKey) {
    return {};
  }
  if (!agentEnsName) {
    throw new ApiError(
      "Set AGENTLATCH_AGENT_ENS to sign with AGENT_PRIVATE_KEY.",
    );
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const message = agentRequestMessage({
    agentId: agentEnsName,
    method,
    path,
    timestamp,
    nonce,
    bodySha256: await sha256Hex(body),
  });
  return {
    [AGENT_ID_HEADER]: agentEnsName,
    [AGENT_TIMESTAMP_HEADER]: timestamp,
    [AGENT_NONCE_HEADER]: nonce,
    [AGENT_SIGNATURE_HEADER]: await privateKeyToAccount(
      agentPrivateKey,
    ).signMessage({ message }),
  };
}

export function listMerchants(): Promise<Merchant[]> {
  return request<Merchant[]>("/x402/merchants");
}

/** Sends the agent key, and the ENS signature when a signing key is set. */
async function submitAction(action: {
  action: string;
  target: string;
  amount: string;
  note?: string;
}): Promise<Action> {
  const path = `/agents/${currentAgentId()}/actions`;
  const body = JSON.stringify(action);
  return request<Action>(path, {
    method: "POST",
    headers: await signedHeaders("POST", path, body),
    body,
  });
}

export function submitPayment(input: {
  url: string;
  amountUsdc: string;
  note?: string;
}): Promise<Action> {
  return submitAction({
    action: "X402_PAYMENT",
    target: input.url,
    amount: input.amountUsdc,
    note: input.note,
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
  return submitAction({
    action: "SWAP",
    target: UNISWAP_SWAP_OUTPUT,
    amount: input.amountUsdc,
    note: input.note,
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

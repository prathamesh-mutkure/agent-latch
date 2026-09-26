import { apiUrl } from "./env";

export type AgentRecord = {
  id: string;
  name: string;
};

export type ActionResult = {
  id: string;
  decision: "ALLOW" | "BLOCK" | "HUMAN_APPROVAL";
  status: string;
  amountUsdc: string;
  approvalRequestId: string | null;
  reasons: string[];
};

export type ApprovalResult = {
  id: string;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED"
    | "CANCELLED"
    | "FAILED";
};

type Health = {
  ok: boolean;
  database?: "up" | "down";
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${path} ${body}`);
  }
  return response.json() as Promise<T>;
}

export function apiHealth(): Promise<Health> {
  return request<Health>("/health");
}

export function listAgents(): Promise<AgentRecord[]> {
  return request<AgentRecord[]>("/agents");
}

export function createAgent(name: string): Promise<AgentRecord> {
  return request<AgentRecord>("/agents", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function setDemoPolicy(agentId: string): Promise<unknown> {
  return request(`/agents/${agentId}/policy`, {
    method: "PUT",
    body: JSON.stringify({
      autonomousLimit: "500",
      hardLimit: "5000",
    }),
  });
}

export function submitSwap(
  agentId: string,
  amount: string,
  note: string,
): Promise<ActionResult> {
  return request<ActionResult>(`/agents/${agentId}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "SWAP",
      target: "0xvenue",
      amount,
      note,
    }),
  });
}

export function getApproval(approvalId: string): Promise<ApprovalResult> {
  return request<ApprovalResult>(`/approvals/${approvalId}`);
}

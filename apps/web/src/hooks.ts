import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getApproval,
  getHealth,
  getOwner,
  getPolicy,
  getWorldConfig,
  listActions,
  listAgents,
  listApprovals,
  listAudit,
} from "./api";

const live = {
  refetchIntervalInBackground: true,
  retry: 1,
} as const;

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 5_000,
    ...live,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
    refetchInterval: 8_000,
    ...live,
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: listApprovals,
    refetchInterval: 2_000,
    ...live,
  });
}

export function useActions(agentId: string | undefined) {
  return useQuery({
    queryKey: ["actions", agentId],
    queryFn: () => listActions(agentId ?? ""),
    enabled: Boolean(agentId),
    refetchInterval: 2_000,
    ...live,
  });
}

export function usePolicy(agentId: string | undefined) {
  return useQuery({
    queryKey: ["policy", agentId],
    queryFn: () => getPolicy(agentId ?? ""),
    enabled: Boolean(agentId),
    refetchInterval: 8_000,
    ...live,
  });
}

export function useAudit(agentId: string | undefined) {
  return useQuery({
    queryKey: ["audit", agentId],
    queryFn: () => listAudit(agentId ?? ""),
    enabled: Boolean(agentId),
    refetchInterval: 2_000,
    ...live,
  });
}

export function useAllActions(agentIds: string[]) {
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["actions", agentId],
      queryFn: () => listActions(agentId),
      refetchInterval: 2_000,
      ...live,
    })),
  });
}

export function useAllAudit(agentIds: string[]) {
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["audit", agentId],
      queryFn: () => listAudit(agentId),
      refetchInterval: 2_000,
      ...live,
    })),
  });
}

export function useAllPolicies(agentIds: string[]) {
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["policy", agentId],
      queryFn: () => getPolicy(agentId),
      refetchInterval: 8_000,
      ...live,
    })),
  });
}

export function useWorldConfig() {
  return useQuery({
    queryKey: ["world-config"],
    queryFn: getWorldConfig,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

/** Linked state, owned agents, and pending approvals for one World App wallet. */
export function useOwner(wallet: string | null) {
  return useQuery({
    queryKey: ["owner", wallet],
    queryFn: () => getOwner(wallet ?? ""),
    enabled: Boolean(wallet),
    refetchInterval: 3_000,
    ...live,
  });
}

export function useApproval(approvalId: string) {
  return useQuery({
    queryKey: ["approval", approvalId],
    queryFn: () => getApproval(approvalId),
    refetchInterval: 2_000,
    ...live,
  });
}

import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getAccount,
  getApproval,
  getHealth,
  getPolicy,
  getWorldConfig,
  listActions,
  listAgents,
  listApprovals,
  listAudit,
} from "./api";
import { useSession } from "./session";

const live = {
  refetchIntervalInBackground: true,
  retry: 1,
} as const;

/** Owner queries run only with a session. The API answers 401 without one. */
function useSignedIn(): boolean {
  return useSession() !== null;
}

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
    enabled: useSignedIn(),
    refetchInterval: 8_000,
    ...live,
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: listApprovals,
    enabled: useSignedIn(),
    refetchInterval: 2_000,
    ...live,
  });
}

export function useActions(agentId: string | undefined) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["actions", agentId],
    queryFn: () => listActions(agentId ?? ""),
    enabled: signedIn && Boolean(agentId),
    refetchInterval: 2_000,
    ...live,
  });
}

export function usePolicy(agentId: string | undefined) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["policy", agentId],
    queryFn: () => getPolicy(agentId ?? ""),
    enabled: signedIn && Boolean(agentId),
    refetchInterval: 8_000,
    ...live,
  });
}

export function useAudit(agentId: string | undefined) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["audit", agentId],
    queryFn: () => listAudit(agentId ?? ""),
    enabled: signedIn && Boolean(agentId),
    refetchInterval: 2_000,
    ...live,
  });
}

export function useAllActions(agentIds: string[]) {
  const signedIn = useSignedIn();
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["actions", agentId],
      queryFn: () => listActions(agentId),
      enabled: signedIn,
      refetchInterval: 2_000,
      ...live,
    })),
  });
}

export function useAllAudit(agentIds: string[]) {
  const signedIn = useSignedIn();
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["audit", agentId],
      queryFn: () => listAudit(agentId),
      enabled: signedIn,
      refetchInterval: 2_000,
      ...live,
    })),
  });
}

export function useAllPolicies(agentIds: string[]) {
  const signedIn = useSignedIn();
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["policy", agentId],
      queryFn: () => getPolicy(agentId),
      enabled: signedIn,
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

/** The signed-in owner's agent IDs and pending approvals. */
export function useAccount() {
  return useQuery({
    queryKey: ["me"],
    queryFn: getAccount,
    enabled: useSignedIn(),
    refetchInterval: 3_000,
    ...live,
  });
}

/** Open to anyone with the ID: the agent polls it, and the push opens it. */
export function useApproval(approvalId: string) {
  return useQuery({
    queryKey: ["approval", approvalId],
    queryFn: () => getApproval(approvalId),
    refetchInterval: 2_000,
    ...live,
  });
}

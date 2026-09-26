import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { claimAgent } from "../api";
import { useAgents, useAllActions, useMe } from "../hooks";
import { agentPosture } from "../model";
import { Empty, PageHeader, Pill, QueryGate } from "../ui";

export function AgentsPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);
  const me = useMe();

  return (
    <>
      <PageHeader
        title="Agents"
        detail="Each agent has an ENS name, a wallet record, and a policy."
      />
      <QueryGate
        isPending={agents.isPending}
        error={agents.error}
        hasData={Boolean(agents.data)}
      >
        {agents.data?.length === 0 ? (
          <Empty>
            No agents yet. The background agent creates trader when it starts.
          </Empty>
        ) : (
          <ul className="grid gap-3">
            {agents.data?.map((agent) => {
              const posture = agentPosture(
                actions.filter((action) => action.agentId === agent.id),
              );
              const granted = agent.ens.roles.filter((role) => role.granted);
              return (
                <li key={agent.id}>
                  <Link
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    className="block rounded-xl border border-line bg-card p-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-medium">
                        {agent.ens.name ?? agent.name}
                      </h2>
                      <Pill>{agent.ens.status}</Pill>
                      <Pill>{posture}</Pill>
                    </div>
                    <p className="mt-3 font-mono text-sm break-all text-muted">
                      {agent.ens.address ?? "No ETH address record"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {granted.length > 0
                        ? `${granted.length} roles granted`
                        : "No roles granted"}
                    </p>
                  </Link>
                  {!agent.userId ? (
                    me.data ? (
                      <ClaimButton agentId={agent.id} />
                    ) : (
                      <a
                        href="/auth/world/login"
                        className="mt-2 inline-block text-sm underline"
                      >
                        Sign in with World ID to claim
                      </a>
                    )
                  ) : me.data && agent.userId === me.data.id ? (
                    <p className="mt-2 text-xs text-muted">
                      You own this agent.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted">
                      Owned by another World ID.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </QueryGate>
    </>
  );
}

export function ClaimButton({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: () => claimAgent(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  return (
    <div className="mt-2 flex items-center gap-3">
      <button
        type="button"
        className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        disabled={claim.isPending}
        onClick={() => claim.mutate()}
      >
        {claim.isPending ? "Claiming…" : "Claim as owner"}
      </button>
      {claim.error ? (
        <p role="alert" className="text-sm text-block">
          {claim.error instanceof Error
            ? claim.error.message
            : "Request failed."}
        </p>
      ) : null}
    </div>
  );
}

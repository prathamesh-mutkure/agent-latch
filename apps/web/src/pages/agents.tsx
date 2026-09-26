import { Link } from "@tanstack/react-router";
import { useAgents, useAllActions } from "../hooks";
import { agentPosture } from "../model";
import { Empty, PageHeader, Pill, QueryGate } from "../ui";

export function AgentsPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);

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
          <Empty>You have no agents yet.</Empty>
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
                </li>
              );
            })}
          </ul>
        )}
      </QueryGate>
    </>
  );
}

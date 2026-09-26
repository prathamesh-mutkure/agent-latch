import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createAgent, registerAgentEns } from "../api";
import { useAgents, useAllActions } from "../hooks";
import { agentPosture } from "../model";
import { Empty, PageHeader, Panel, Pill, QueryGate } from "../ui";

export function AgentsPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);

  return (
    <>
      <PageHeader
        title="Agents"
        detail="Each agent has an ENS name, a key, and a policy. The key is shown once."
      />
      <div className="mb-4">
        <RegisterAgent />
      </div>
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

function RegisterAgent() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    key: string;
    setupError: string | null;
  } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setCreated(null);
    try {
      const agent = await createAgent(name.trim());
      let { setupError } = agent;
      try {
        await registerAgentEns(agent.id);
      } catch (ensError) {
        setupError =
          ensError instanceof Error
            ? ensError.message
            : "ENS registration failed.";
      }
      setCreated({ id: agent.id, key: agent.key, setupError });
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not register.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="Register an agent">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="grid gap-1 text-sm">
          ENS name
          <input
            className="rounded-md border border-line bg-card px-3 py-2 font-mono"
            value={name}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="trader"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="text-sm text-muted">
          3 to 32 letters, digits, and dashes. This registers the name on
          Sepolia and starts the agent at 500 USDC autonomous, 5000 hard.
        </p>
        <button
          type="submit"
          disabled={pending || name.trim().length < 3}
          className="w-fit rounded-md border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Registering…" : "Register"}
        </button>
        {error ? <p className="text-sm text-block">{error}</p> : null}
      </form>
      {created ? (
        <div className="mt-4 grid gap-2 border-t border-line pt-4">
          <p className="text-sm font-medium">
            Copy this key now. It is not shown again.
          </p>
          <textarea
            readOnly
            className="rounded-md border border-line bg-card p-3 font-mono text-sm"
            rows={3}
            value={created.key}
          />
          <p className="text-sm text-muted">
            Put it in <span className="font-mono">AGENT_KEY</span> for the
            background agent and Claude. Agent id{" "}
            <span className="font-mono">{created.id}</span>.
          </p>
          {created.setupError ? (
            <p className="text-sm text-block">{created.setupError}</p>
          ) : (
            <p className="text-sm text-muted">ENS name registered.</p>
          )}
          <Link
            to="/agents/$agentId"
            params={{ agentId: created.id }}
            className="text-sm font-medium underline"
          >
            Open this agent
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

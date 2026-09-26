import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { issueAgentKey, registerAgentEns } from "../api";
import {
  useActions,
  useAgents,
  useApprovals,
  useAudit,
  usePolicy,
} from "../hooks";
import {
  agentPosture,
  ensState,
  formatBaseUnits,
  formatDollars,
  formatExpiry,
  formatWhen,
  latestByTime,
  riskLabel,
  roleLabel,
  spentToday,
} from "../model";
import { useSession } from "../session";
import {
  ApprovalActions,
  Empty,
  Field,
  PageHeader,
  Panel,
  Pill,
  QueryGate,
  Stat,
} from "../ui";

export function AgentPage() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const session = useSession();
  const agents = useAgents();
  const actions = useActions(agentId);
  const policy = usePolicy(agentId);
  const audit = useAudit(agentId);
  const approvals = useApprovals();
  const agent = agents.data?.find((item) => item.id === agentId);
  const pending = approvals.data?.find(
    (approval) => approval.agentId === agentId && approval.status === "PENDING",
  );
  const latest = latestByTime(actions.data ?? []);
  const posture = agentPosture(actions.data ?? []);
  const spent = spentToday(actions.data ?? []);
  const risk = riskLabel({
    pendingBaseUnits: pending?.amountBaseUnits ?? null,
    hardLimitUsdc: policy.data?.hardLimitUsdc ?? null,
    latestStatus: latest?.status ?? null,
  });
  const pendingAction = actions.data?.find(
    (action) => action.id === pending?.actionRequestId,
  );
  const granted = agent?.ens.roles.filter((role) => role.granted) ?? [];
  const events = [...(audit.data ?? [])].reverse();

  return (
    <QueryGate
      isPending={agents.isPending}
      error={agents.error}
      hasData={Boolean(agents.data)}
    >
      {!agent ? (
        <PageHeader title="Agent not found" />
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {agent.ens.name ?? agent.ensName}
            </h1>
            <Pill>{posture}</Pill>
            <Pill>{ensState(agent)}</Pill>
          </div>
          {agent.ens.status !== "REGISTERED" ? (
            <div className="mb-4">
              <EnsRegistration agent={agent} />
            </div>
          ) : null}
          <div className="mb-4">
            <AgentKey agentId={agent.id} hasKey={agent.hasKey} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Stat
              label="Autonomous limit"
              value={
                policy.isPending
                  ? "Loading…"
                  : policy.isError
                    ? "Unavailable"
                    : policy.data
                      ? `${formatDollars(policy.data.autonomousLimitUsdc)} / action`
                      : "No policy"
              }
            />
            <Stat
              label="Hard limit"
              value={
                policy.isPending
                  ? "Loading…"
                  : policy.isError
                    ? "Unavailable"
                    : policy.data
                      ? formatDollars(policy.data.hardLimitUsdc)
                      : "No policy"
              }
            />
            <Stat
              label="Today's spend"
              value={
                actions.isPending && !actions.data
                  ? "Loading…"
                  : formatBaseUnits(spent.toString())
              }
              detail={
                policy.isPending
                  ? undefined
                  : policy.data
                    ? policy.data.dailyLimitUsdc
                      ? `of ${formatDollars(policy.data.dailyLimitUsdc)}`
                      : "No daily cap"
                    : undefined
              }
            />
            <Stat label="Risk" value={risk.level} detail={risk.detail} />
          </div>
          <div className="mt-4">
            {pending ? (
              <Panel title="Pending approval">
                <p className="text-lg font-medium">
                  {pending.action} {formatDollars(pending.amountUsdc)}
                </p>
                {pendingAction?.note ? (
                  <p className="mt-1 text-sm text-muted">
                    {pendingAction.note}
                  </p>
                ) : null}
                <p className="mt-2 text-sm">{pending.reason}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatExpiry(pending.expiresAt)} · target {pending.target}
                </p>
                <p className="mt-1 text-sm text-muted">
                  This approval covers this action only.
                </p>
                <ApprovalActions
                  approvalId={pending.id}
                  label={`${pending.action} ${formatDollars(pending.amountUsdc)}`}
                />
              </Panel>
            ) : (
              <Panel title="Pending approval">
                <Empty>Nothing is waiting on a person.</Empty>
              </Panel>
            )}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="Identity">
              <dl>
                <Field label="Name" value={agent.ens.name ?? agent.name} />
                <Field
                  label="Wallet"
                  value={agent.ens.address ?? "No ETH address record"}
                />
                <Field label="ENS owner" value={agent.ens.owner ?? "Unknown"} />
                <Field
                  label="Owner"
                  value={`You, World App wallet ${session?.wallet ?? ""}`}
                />
                <Field label="Registry" value={agent.ens.registry} />
                <Field
                  label="Expiry"
                  value={
                    agent.ens.expiry ? formatWhen(agent.ens.expiry) : "None"
                  }
                />
                <Field
                  label="Namespace"
                  value={agent.ens.namespace ?? "None"}
                />
              </dl>
              {agent.ens.detail ? (
                <p className="mt-3 text-sm text-muted">{agent.ens.detail}</p>
              ) : null}
              <h3 className="mt-5 text-sm font-medium tracking-wide text-muted">
                Permissions
              </h3>
              {granted.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No roles granted.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {granted.map((role) => (
                    <li key={role.role}>
                      <span className="rounded-full bg-line px-2 py-0.5 text-xs text-ink">
                        {roleLabel(role.role)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Activity">
              {audit.isPending && events.length === 0 ? (
                <p className="text-muted">Loading…</p>
              ) : events.length === 0 ? (
                <Empty>No activity yet.</Empty>
              ) : (
                <ol className="grid gap-4">
                  {events.slice(0, 8).map((event) => (
                    <li key={event.id} className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill>{event.kind}</Pill>
                        <time
                          className="text-xs text-muted"
                          dateTime={event.createdAt}
                        >
                          {formatWhen(event.createdAt)}
                        </time>
                      </div>
                      <p className="text-sm">{event.summary}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}
    </QueryGate>
  );
}

function AgentKey({ agentId, hasKey }: { agentId: string; hasKey: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const snippet = `{
  "mcpServers": {
    "agentlatch": {
      "command": "bun",
      "args": ["apps/mcp/src/index.ts"],
      "env": {
        "API_URL": "http://localhost:3001",
        "AGENT_ID": "${agentId}",
        "AGENT_KEY": "<the key shown once>"
      }
    }
  }
}`;

  async function onIssue() {
    setPending(true);
    setError(null);
    try {
      const issued = await issueAgentKey(agentId);
      setKey(issued.key);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (issueError) {
      setError(
        issueError instanceof Error
          ? issueError.message
          : "Could not create a key.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="Agent key">
      {key ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            Copy this key now. It is not shown again.
            {hasKey ? " The previous key no longer works." : ""}
          </p>
          <textarea
            readOnly
            className="rounded-md border border-line bg-card p-3 font-mono text-sm"
            rows={3}
            value={key}
          />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {hasKey
              ? "A key is set. Replacing it stops the old one. The background agent and Claude read AGENT_KEY from the environment."
              : "This agent has no key, so it cannot act. Create one and put it in AGENT_KEY."}
          </p>
          <button
            type="button"
            disabled={pending}
            className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void onIssue()}
          >
            {pending ? "Creating…" : hasKey ? "Replace key" : "Create key"}
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-sm text-block">{error}</p> : null}
      <h3 className="mt-5 text-sm font-medium tracking-wide text-muted">
        Connect to Claude
      </h3>
      <pre className="mt-2 overflow-x-auto rounded-md border border-line p-3 font-mono text-xs">
        {snippet}
      </pre>
    </Panel>
  );
}

/** Starts or retries the background ENS registration. The agent list polls its state. */
function EnsRegistration({
  agent,
}: {
  agent: {
    id: string;
    ensName: string;
    registration: {
      state: "REGISTERING" | "FAILED";
      error: string | null;
    } | null;
  };
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const running = agent.registration?.state === "REGISTERING";

  async function start() {
    setError(null);
    try {
      await registerAgentEns(agent.id);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Registration did not start.",
      );
    }
  }

  return (
    <Panel title="ENS name">
      <p className="text-sm">
        {running
          ? `Registering ${agent.ensName} on Sepolia. It takes a few minutes.`
          : `${agent.ensName} is not registered yet. Actions are blocked until it is.`}
      </p>
      {agent.registration?.state === "FAILED" ? (
        <p className="mt-2 text-sm text-block">
          Last attempt failed: {agent.registration.error}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-block">{error}</p> : null}
      <button
        type="button"
        disabled={running}
        onClick={() => void start()}
        className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {running ? "Registering…" : "Register on ENS"}
      </button>
    </Panel>
  );
}

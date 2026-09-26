import { useParams } from "@tanstack/react-router";
import {
  useActions,
  useAgents,
  useApprovals,
  useAudit,
  usePolicy,
} from "../hooks";
import {
  agentPosture,
  formatBaseUnits,
  formatDollars,
  formatExpiry,
  formatWhen,
  latestByTime,
  riskLabel,
  roleLabel,
  spentToday,
} from "../model";
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
              {agent.ens.name ?? agent.name}
            </h1>
            <Pill>{posture}</Pill>
            <Pill>{agent.ens.status}</Pill>
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
                <Field label="Owner" value={agent.ens.owner ?? "Unknown"} />
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

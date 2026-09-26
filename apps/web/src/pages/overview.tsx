import { Link } from "@tanstack/react-router";
import type { ActionRecord, AgentRecord, ApprovalRecord } from "../api";
import { useAgents, useAllActions, useApprovals } from "../hooks";
import {
  agentPosture,
  formatBaseUnits,
  formatDollars,
  formatExpiry,
  spentToday,
} from "../model";
import { ApprovalActions, Empty, PageHeader, Pill, QueryGate } from "../ui";

function agentName(agents: AgentRecord[], agentId: string): string {
  const agent = agents.find((item) => item.id === agentId);
  return agent?.ens.name ?? agent?.name ?? agentId;
}

export function OverviewPage() {
  const agents = useAgents();
  const approvals = useApprovals();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);
  const pending =
    approvals.data?.filter((approval) => approval.status === "PENDING") ?? [];
  const executedToday = actions.filter((action) => {
    if (action.status !== "EXECUTED") {
      return false;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return new Date(action.createdAt).getTime() >= start.getTime();
  });
  const blockedToday = actions.filter((action) => {
    if (action.status !== "BLOCKED") {
      return false;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return new Date(action.createdAt).getTime() >= start.getTime();
  });

  return (
    <>
      <PageHeader
        title="Overview"
        detail="Agents act on their own until a request is above the autonomous limit."
      />
      <QueryGate
        isPending={agents.isPending || approvals.isPending}
        error={agents.error ?? approvals.error}
        hasData={Boolean(agents.data && approvals.data)}
      >
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="text-sm text-muted">Agents</p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {agents.data?.length ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="text-sm text-muted">Pending approvals</p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {pending.length}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="text-sm text-muted">Today</p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {executedToday.length} allowed
            </p>
            <p className="mt-1 text-sm text-muted">
              {blockedToday.length} blocked
            </p>
          </div>
        </div>
        {agents.data && approvals.data ? (
          <PendingList
            pending={pending}
            agents={agents.data}
            actions={actions}
          />
        ) : null}
        {agents.data && agents.data.length === 0 ? (
          <Empty>
            No agents yet. The background agent creates trader when it starts.
          </Empty>
        ) : (
          <ul className="grid gap-4">
            {agents.data?.map((agent) => {
              const agentActions = actions.filter(
                (action) => action.agentId === agent.id,
              );
              return (
                <li key={agent.id}>
                  <AgentCard agent={agent} actions={agentActions} />
                </li>
              );
            })}
          </ul>
        )}
      </QueryGate>
    </>
  );
}

function PendingList({
  pending,
  agents,
  actions,
}: {
  pending: ApprovalRecord[];
  agents: AgentRecord[];
  actions: ActionRecord[];
}) {
  if (pending.length === 0) {
    return null;
  }
  return (
    <div className="mb-8 grid gap-4">
      {pending.map((approval) => {
        const action = actions.find(
          (item) => item.id === approval.actionRequestId,
        );
        const label = `${approval.action} ${formatDollars(approval.amountUsdc)}`;
        return (
          <article
            key={approval.id}
            className="rounded-xl border border-wait/40 bg-wait-soft p-5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Pill>PENDING</Pill>
              <h2 className="text-lg font-medium text-ink">
                {label} needs approval
              </h2>
            </div>
            <p className="mt-2 text-sm text-ink">
              {agentName(agents, approval.agentId)}
              {action?.note ? ` · ${action.note}` : ""}
            </p>
            <p className="mt-1 text-sm text-muted">{approval.reason}</p>
            <p className="mt-1 text-sm text-muted">
              {formatExpiry(approval.expiresAt)} · this approval covers this
              action only
            </p>
            <ApprovalActions approvalId={approval.id} label={label} />
          </article>
        );
      })}
    </div>
  );
}

function AgentCard({
  agent,
  actions,
}: {
  agent: AgentRecord;
  actions: ActionRecord[];
}) {
  const posture = agentPosture(actions);
  const spent = formatBaseUnits(spentToday(actions).toString());
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      className="block rounded-xl border border-line bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">{agent.ens.name ?? agent.name}</h2>
        <Pill>{posture}</Pill>
      </div>
      <p className="mt-2 font-mono text-sm text-muted">
        {spent} spent today
        {agent.ens.address ? ` · ${agent.ens.address}` : ""}
      </p>
    </Link>
  );
}

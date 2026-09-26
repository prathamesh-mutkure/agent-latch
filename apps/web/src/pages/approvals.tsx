import { Link } from "@tanstack/react-router";
import type { ActionRecord, AgentRecord, ApprovalRecord } from "../api";
import { useAgents, useAllActions, useApprovals } from "../hooks";
import { formatDollars, formatExpiry, formatWhen } from "../model";
import { ApprovalActions, Empty, PageHeader, Pill, QueryGate } from "../ui";

export function ApprovalsPage() {
  const approvals = useApprovals();
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);
  const pending =
    approvals.data?.filter((approval) => approval.status === "PENDING") ?? [];
  const history =
    approvals.data
      ?.filter((approval) => approval.status !== "PENDING")
      .slice()
      .reverse() ?? [];

  return (
    <>
      <PageHeader
        title="Pending approvals"
        detail="Approve and deny each ask for a fresh World ID proof from the agent's owner, bound to that one decision."
      />
      <QueryGate
        isPending={approvals.isPending}
        error={approvals.error}
        hasData={Boolean(approvals.data)}
      >
        {pending.length === 0 ? (
          <Empty>No approvals waiting.</Empty>
        ) : (
          <div className="grid gap-4">
            {pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                agents={agents.data ?? []}
                actions={actions}
              />
            ))}
          </div>
        )}
        {history.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-medium tracking-wide text-muted">
              Resolved
            </h2>
            <ul className="grid gap-3">
              {history.map((approval) => (
                <li
                  key={approval.id}
                  className="rounded-xl border border-line bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{approval.status}</Pill>
                    {approval.failureReason ? (
                      <Pill>{approval.failureReason}</Pill>
                    ) : null}
                    <p className="font-medium">
                      {approval.action} {formatDollars(approval.amountUsdc)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted">{approval.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatWhen(approval.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </QueryGate>
    </>
  );
}

function ApprovalCard({
  approval,
  agents,
  actions,
}: {
  approval: ApprovalRecord;
  agents: AgentRecord[];
  actions: ActionRecord[];
}) {
  const agent = agents.find((item) => item.id === approval.agentId);
  const action = actions.find((item) => item.id === approval.actionRequestId);
  const label = `${approval.action} ${formatDollars(approval.amountUsdc)}`;
  return (
    <article className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Pill>PENDING</Pill>
        <h2 className="text-2xl font-semibold tabular-nums">{label}</h2>
        <Link
          to="/approve/$approvalId"
          params={{ approvalId: approval.id }}
          search={{}}
          className="ml-auto text-sm underline"
        >
          Details
        </Link>
      </div>
      <p className="mt-3 text-sm">
        {agent?.ens.name ?? agent?.name ?? approval.agentId}
        {action?.note ? ` · ${action.note}` : ""}
      </p>
      <p className="mt-2 text-sm">{approval.reason}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Target</dt>
          <dd className="font-mono break-all">{approval.target}</dd>
        </div>
        <div>
          <dt className="text-muted">Token</dt>
          <dd className="font-mono break-all">{approval.token}</dd>
        </div>
        <div>
          <dt className="text-muted">Expires</dt>
          <dd>{formatExpiry(approval.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Nonce</dt>
          <dd className="font-mono break-all">{approval.nonce}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        This approval covers this action only.
      </p>
      <ApprovalActions approvalId={approval.id} label={label} />
    </article>
  );
}

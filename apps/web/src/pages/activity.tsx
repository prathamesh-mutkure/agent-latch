import type { AgentRecord, AuditRecord } from "../api";
import { useAgents, useAllAudit } from "../hooks";
import { formatWhen } from "../model";
import { Empty, PageHeader, Pill, QueryGate, TxText } from "../ui";

export function ActivityPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const auditQueries = useAllAudit(agentIds);
  const events = auditQueries
    .flatMap((query, index) => {
      const agent = agents.data?.[index];
      return (query.data ?? []).map((event) => ({ event, agent }));
    })
    .sort((left, right) =>
      right.event.createdAt.localeCompare(left.event.createdAt),
    );

  return (
    <>
      <PageHeader
        title="Activity"
        detail="Allow, block, and approval decisions from the audit log."
      />
      <QueryGate
        isPending={agents.isPending}
        error={agents.error}
        hasData={Boolean(agents.data)}
      >
        {events.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <ol className="grid gap-4">
            {events.map(({ event, agent }) => (
              <TimelineItem key={event.id} event={event} agent={agent} />
            ))}
          </ol>
        )}
      </QueryGate>
    </>
  );
}

function TimelineItem({
  event,
  agent,
}: {
  event: AuditRecord;
  agent: AgentRecord | undefined;
}) {
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{event.kind}</Pill>
        <span className="text-sm text-muted">
          {agent?.ens.name ?? agent?.name ?? "Agent"}
        </span>
        <time className="text-xs text-muted" dateTime={event.createdAt}>
          {formatWhen(event.createdAt)}
        </time>
      </div>
      <p className="mt-2 text-sm break-words">
        <TxText text={event.summary} />
      </p>
    </li>
  );
}

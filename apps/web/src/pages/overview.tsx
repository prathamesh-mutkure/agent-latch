import { Link } from "@tanstack/react-router";
import type {
  ActionRecord,
  AgentRecord,
  ApprovalRecord,
  AuditRecord,
  PolicyRecord,
} from "../api";
import {
  useAgents,
  useAllActions,
  useAllAudit,
  useAllPolicies,
  useApprovals,
} from "../hooks";
import {
  agentPosture,
  dailySpend,
  ensState,
  formatAgo,
  formatBaseUnits,
  formatDollars,
  formatExpiry,
  formatUsdcToBase,
  latestByTime,
  spentToday,
} from "../model";
import {
  DecideOnPhone,
  PageHeader,
  Panel,
  Pill,
  QueryGate,
  Stat,
  TxText,
} from "../ui";

function agentName(agents: AgentRecord[], agentId: string): string {
  const agent = agents.find((item) => item.id === agentId);
  return agent?.ens.name ?? agent?.name ?? agentId;
}

function isToday(iso: string): boolean {
  return new Date(iso).getTime() >= new Date().setHours(0, 0, 0, 0);
}

export function OverviewPage() {
  const agents = useAgents();
  const approvals = useApprovals();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);
  const policyQueries = useAllPolicies(agentIds);
  const auditQueries = useAllAudit(agentIds);
  const recent = auditQueries
    .flatMap((query, index) =>
      (query.data ?? []).map((event) => ({
        event,
        agent: agents.data?.[index],
      })),
    )
    .sort((left, right) =>
      right.event.createdAt.localeCompare(left.event.createdAt),
    )
    .slice(0, 8);
  const pending =
    approvals.data?.filter((approval) => approval.status === "PENDING") ?? [];
  const todayActions = actions.filter((action) => isToday(action.createdAt));
  const decided = (decision: string) =>
    todayActions.filter((action) => action.decision === decision).length;
  const capBase = policyQueries.reduce((sum, query) => {
    const cap = query.data?.dailyLimitUsdc;
    return cap ? sum + BigInt(formatUsdcToBase(cap)) : sum;
  }, 0n);
  const postures = (agents.data ?? []).map((agent) =>
    agentPosture(actions.filter((action) => action.agentId === agent.id)),
  );
  const soonest = pending.reduce<string | null>(
    (first, approval) =>
      first === null || approval.expiresAt < first ? approval.expiresAt : first,
    null,
  );

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
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Spent today"
            value={formatBaseUnits(spentToday(actions).toString())}
            detail={
              capBase > 0n
                ? `of ${formatBaseUnits(capBase.toString())} combined daily cap`
                : "Executed actions, all agents"
            }
          />
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="text-sm text-muted">Decisions today</p>
            <p className="mt-2 font-mono text-2xl font-medium tabular-nums text-ink">
              {todayActions.length}
            </p>
            <DecisionBar
              allowed={decided("ALLOW")}
              approval={decided("HUMAN_APPROVAL")}
              blocked={decided("BLOCK")}
            />
          </div>
          <div
            className={`rounded-xl border p-5 ${pending.length > 0 ? "border-wait/40 bg-wait-soft" : "border-line bg-card"}`}
          >
            <p className="text-sm text-muted">Pending approvals</p>
            <p className="mt-2 font-mono text-2xl font-medium tabular-nums text-ink">
              {pending.length}
            </p>
            <p className="mt-2 text-sm text-muted">
              {soonest ? formatExpiry(soonest) : "Nothing waiting on you"}
            </p>
          </div>
          <Stat
            label="Agents"
            value={String(agents.data?.length ?? 0)}
            detail={`${postures.filter((p) => p === "RUNNING").length} running · ${postures.filter((p) => p === "WAITING").length} waiting`}
          />
        </div>

        {agents.data ? (
          <PendingList
            pending={pending}
            agents={agents.data}
            actions={actions}
          />
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section>
            <SectionTitle title="Agents" to="/agents" link="Manage" />
            {agents.data && agents.data.length === 0 ? (
              <p className="text-muted">
                You have no agents yet.{" "}
                <Link to="/agents" className="underline">
                  Register one
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-4">
                {agents.data?.map((agent, index) => (
                  <li key={agent.id}>
                    <AgentCard
                      agent={agent}
                      actions={actions.filter(
                        (action) => action.agentId === agent.id,
                      )}
                      policy={policyQueries[index]?.data ?? null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="grid content-start gap-8">
            <section>
              <SectionTitle title="Spend, last 7 days" />
              <Panel>
                <SpendChart actions={actions} />
              </Panel>
            </section>
            <section>
              <SectionTitle
                title="Recent activity"
                to="/activity"
                link="All activity"
              />
              {recent.length === 0 ? (
                <p className="text-sm text-muted">No activity yet.</p>
              ) : (
                <ol className="divide-y divide-line rounded-xl border border-line bg-card">
                  {recent.map(({ event, agent }) => (
                    <ActivityRow key={event.id} event={event} agent={agent} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </QueryGate>
    </>
  );
}

function SectionTitle({
  title,
  to,
  link,
}: {
  title: string;
  to?: "/agents" | "/activity";
  link?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-medium tracking-wide text-muted">{title}</h2>
      {to ? (
        <Link to={to} className="text-sm text-muted underline hover:text-ink">
          {link}
        </Link>
      ) : null}
    </div>
  );
}

/** Share of today's decisions: allowed alone, sent to a person, blocked. */
function DecisionBar({
  allowed,
  approval,
  blocked,
}: {
  allowed: number;
  approval: number;
  blocked: number;
}) {
  const total = allowed + approval + blocked;
  const parts = [
    { count: allowed, label: "allowed", bar: "bg-allow" },
    { count: approval, label: "approval", bar: "bg-wait" },
    { count: blocked, label: "blocked", bar: "bg-block" },
  ];
  return (
    <>
      {total > 0 ? (
        <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {parts.map((part) =>
            part.count > 0 ? (
              <div
                key={part.label}
                className={part.bar}
                style={{ flexGrow: part.count }}
              />
            ) : null,
          )}
        </div>
      ) : null}
      <p className="mt-2 text-sm text-muted">
        {parts.map((part) => `${part.count} ${part.label}`).join(" · ")}
      </p>
    </>
  );
}

function SpendChart({ actions }: { actions: ActionRecord[] }) {
  const days = dailySpend(actions, 7);
  const max = days.reduce(
    (top, day) => (day.baseUnits > top ? day.baseUnits : top),
    0n,
  );
  const total = days.reduce((sum, day) => sum + day.baseUnits, 0n);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const fullDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return (
    <figure>
      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
        {formatBaseUnits(total.toString())}
      </p>
      <figcaption className="mt-1 text-sm text-muted">
        Executed spend, all agents
      </figcaption>
      <ol className="mt-5 grid h-32 grid-cols-7 items-end gap-2">
        {days.map(({ day, baseUnits }, index) => {
          const amount = formatBaseUnits(baseUnits.toString());
          const height =
            max > 0n ? Math.max(2, Number((baseUnits * 100n) / max)) : 2;
          const last = index === days.length - 1;
          return (
            <li
              key={day.getTime()}
              className="group relative flex h-full flex-col justify-end"
              aria-label={`${fullDate.format(day)}: ${amount}`}
            >
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-paper group-hover:block">
                {amount}
              </span>
              <div
                className={`rounded-t ${baseUnits > 0n ? (last ? "bg-ink" : "bg-ink/40") : "bg-line"} group-hover:bg-ink`}
                style={{ height: `${height}%` }}
              />
            </li>
          );
        })}
      </ol>
      <div className="mt-2 grid grid-cols-7 gap-2 text-center text-xs text-muted">
        {days.map(({ day }, index) => (
          <span key={day.getTime()}>
            {index === days.length - 1 ? "Today" : weekday.format(day)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function ActivityRow({
  event,
  agent,
}: {
  event: AuditRecord;
  agent: AgentRecord | undefined;
}) {
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{event.kind}</Pill>
        <span className="truncate text-sm text-ink">
          {agent?.ens.name ?? agent?.name ?? "Agent"}
        </span>
        <time
          className="ml-auto text-xs whitespace-nowrap text-muted"
          dateTime={event.createdAt}
          title={event.createdAt}
        >
          {formatAgo(event.createdAt)}
        </time>
      </div>
      <p className="line-clamp-2 text-sm break-words text-muted">
        <TxText text={event.summary} />
      </p>
    </li>
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
    <div className="mb-8 grid gap-4 md:grid-cols-2">
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
            <DecideOnPhone approvalId={approval.id} />
          </article>
        );
      })}
    </div>
  );
}

function AgentCard({
  agent,
  actions,
  policy,
}: {
  agent: AgentRecord;
  actions: ActionRecord[];
  policy: PolicyRecord | null;
}) {
  const posture = agentPosture(actions);
  const spentBase = spentToday(actions);
  const capBase = policy?.dailyLimitUsdc
    ? BigInt(formatUsdcToBase(policy.dailyLimitUsdc))
    : 0n;
  const percent =
    capBase > 0n ? Math.min(100, Number((spentBase * 100n) / capBase)) : null;
  const latest = latestByTime(actions);
  const today = actions.filter((action) => isToday(action.createdAt)).length;
  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      className="block rounded-xl border border-line bg-card p-5 hover:border-muted"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-lg font-medium break-all">
          {agent.ens.name ?? agent.name}
        </h3>
        <Pill>{posture}</Pill>
        <Pill>{ensState(agent)}</Pill>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">Spent today</span>
        <span className="font-mono tabular-nums text-ink">
          {formatBaseUnits(spentBase.toString())}
          {policy?.dailyLimitUsdc ? (
            <span className="text-muted">
              {" "}
              / {formatDollars(policy.dailyLimitUsdc)}
            </span>
          ) : null}
        </span>
      </div>
      {percent !== null ? (
        <div
          role="progressbar"
          aria-label="Daily limit used"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div
            className={`h-full rounded-full ${percent >= 100 ? "bg-block" : percent >= 80 ? "bg-wait" : "bg-allow"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {policy ? (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
          <Limit label="Acts alone" value={policy.autonomousLimitUsdc} />
          <Limit label="Hard limit" value={policy.hardLimitUsdc} />
          <div>
            <dt className="text-xs text-muted">Today</dt>
            <dd className="font-mono tabular-nums">
              {today} action{today === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
        {latest ? (
          <>
            <span className="text-muted">Last</span>
            <span className="font-mono">
              {latest.action} {formatDollars(latest.amountUsdc)}
            </span>
            <Pill>{latest.status}</Pill>
            <span className="ml-auto text-xs text-muted">
              {formatAgo(latest.createdAt)}
            </span>
          </>
        ) : (
          <span className="text-muted">No actions yet</span>
        )}
      </div>
    </Link>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{formatDollars(value)}</dd>
    </div>
  );
}

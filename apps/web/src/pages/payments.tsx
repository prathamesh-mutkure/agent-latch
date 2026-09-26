import { useAgents, useAllActions } from "../hooks";
import { formatDollars, formatWhen } from "../model";
import { Empty, PageHeader, Pill, QueryGate, TxText } from "../ui";

export function PaymentsPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const payments = actionQueries
    .flatMap((query) => query.data ?? [])
    .filter((action) => action.action === "X402_PAYMENT")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <>
      <PageHeader
        title="Payments"
        detail="x402 payments show up here with the policy decision for that payment."
      />
      <QueryGate
        isPending={agents.isPending}
        error={agents.error}
        hasData={Boolean(agents.data)}
      >
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <ul className="grid gap-3">
            {payments.map((payment) => {
              const agent = agents.data?.find(
                (item) => item.id === payment.agentId,
              );
              return (
                <li
                  key={payment.id}
                  className="rounded-xl border border-line bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{payment.decision}</Pill>
                    <Pill>{payment.status}</Pill>
                    <p className="font-medium tabular-nums">
                      {formatDollars(payment.amountUsdc)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm break-all text-muted">
                    {agent?.ens.name ?? agent?.name ?? payment.agentId} ·{" "}
                    {payment.target}
                  </p>
                  <p className="mt-1 text-sm break-words">
                    <TxText text={payment.reasons.join(" · ")} />
                  </p>
                  <time
                    className="mt-2 block text-xs text-muted"
                    dateTime={payment.createdAt}
                  >
                    {formatWhen(payment.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </QueryGate>
    </>
  );
}

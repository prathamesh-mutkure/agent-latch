import { Link } from "@tanstack/react-router";
import { useAgents, useAllPolicies } from "../hooks";
import { formatDollars, formatWhen } from "../model";
import { Empty, Field, PageHeader, Panel, QueryGate } from "../ui";

export function PoliciesPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const policyQueries = useAllPolicies(agentIds);

  return (
    <>
      <PageHeader
        title="Policies"
        detail="Amounts are USDC and display as dollars. Above the autonomous limit waits for a person. Above the hard limit is blocked."
      />
      <QueryGate
        isPending={agents.isPending}
        error={agents.error}
        hasData={Boolean(agents.data)}
      >
        {agents.data?.length === 0 ? (
          <Empty>No agents yet, so there is no policy to show.</Empty>
        ) : (
          <div className="grid gap-4">
            {agents.data?.map((agent, index) => {
              const policy = policyQueries[index]?.data;
              const pending = policyQueries[index]?.isPending;
              const error = policyQueries[index]?.error;
              return (
                <Panel key={agent.id}>
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-medium">
                      <Link
                        to="/agents/$agentId"
                        params={{ agentId: agent.id }}
                        className="underline decoration-line underline-offset-4"
                      >
                        {agent.ens.name ?? agent.name}
                      </Link>
                    </h2>
                    {policy ? (
                      <p className="text-xs text-muted">
                        Updated {formatWhen(policy.updatedAt)}
                      </p>
                    ) : null}
                  </div>
                  {pending ? <p className="text-muted">Loading…</p> : null}
                  {error ? (
                    <p className="text-block">
                      {error instanceof Error
                        ? error.message
                        : "Request failed."}
                    </p>
                  ) : null}
                  {policy === null ? <Empty>No policy yet.</Empty> : null}
                  {policy ? (
                    <dl>
                      <Field
                        label="Autonomous limit"
                        value={`${formatDollars(policy.autonomousLimitUsdc)} / action`}
                      />
                      <Field
                        label="Hard limit"
                        value={formatDollars(policy.hardLimitUsdc)}
                      />
                      <Field
                        label="Daily limit"
                        value={
                          policy.dailyLimitUsdc
                            ? formatDollars(policy.dailyLimitUsdc)
                            : "No daily cap"
                        }
                      />
                      <Field
                        label="Actions"
                        value={policy.allowedActions.join(", ")}
                      />
                      <Field
                        label="Tokens"
                        value={
                          policy.allowedTokens.length > 0
                            ? policy.allowedTokens.join(", ")
                            : "None"
                        }
                      />
                      <Field
                        label="Targets"
                        value={
                          policy.allowedTargets.length > 0
                            ? policy.allowedTargets.join(", ")
                            : "Any target"
                        }
                      />
                    </dl>
                  ) : null}
                </Panel>
              );
            })}
          </div>
        )}
      </QueryGate>
    </>
  );
}

import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAgents, useApproval } from "../hooks";
import { formatDollars } from "../model";
import {
  ApprovalActions,
  Field,
  OpenInWorldApp,
  PageHeader,
  Panel,
  Pill,
  QueryGate,
} from "../ui";
import { insideWorldApp } from "../world";

/** `?result=` values from a signed World App decision. */
const outcomes: Record<string, { tone: "allow" | "block"; text: string }> = {
  paid: { tone: "allow", text: "Approved. The payment settled." },
  approved: { tone: "allow", text: "Approved. The action ran." },
  denied: { tone: "allow", text: "Denied. Nothing ran." },
  expired: {
    tone: "block",
    text: "The approval expired before you decided. Nothing ran.",
  },
  binding: {
    tone: "block",
    text: "The action changed after the approval opened. Nothing ran.",
  },
  payment_failed: {
    tone: "block",
    text: "You approved, but the payment did not settle.",
  },
  passport_inactive: {
    tone: "block",
    text: "The agent's ENS name is missing or expired. Nothing ran.",
  },
  passport_unread: {
    tone: "block",
    text: "The agent's ENS name could not be read. Nothing ran and the approval is still open. Try again.",
  },
};

function countdown(iso: string, now: number): string {
  const seconds = Math.max(
    0,
    Math.floor((new Date(iso).getTime() - now) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ApprovePage() {
  const { approvalId } = useParams({ from: "/approve/$approvalId" });
  const { result } = useSearch({ from: "/approve/$approvalId" });
  const approval = useApproval(approvalId);
  const agents = useAgents();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const outcome = result ? outcomes[result] : undefined;
  const data = approval.data;
  const agent = agents.data?.find((item) => item.id === data?.agentId);
  const label = data ? `${data.action} ${formatDollars(data.amountUsdc)}` : "";
  const unclaimed = Boolean(agent && !agent.userId);

  return (
    <>
      <PageHeader
        title="Approve one action"
        detail="The agent went past its rules. Approve or deny this one action. Your World App signature covers only this action and this decision."
      />
      {outcome ? (
        <p
          role="status"
          className={`mb-6 rounded-xl px-4 py-3 text-sm ${
            outcome.tone === "allow"
              ? "bg-allow-soft text-allow"
              : "bg-block-soft text-block"
          }`}
        >
          {outcome.text}
        </p>
      ) : null}
      <QueryGate
        isPending={approval.isPending}
        error={approval.error}
        hasData={Boolean(data)}
      >
        {data ? (
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Pill>{data.status}</Pill>
              <h2 className="text-2xl font-semibold tabular-nums">{label}</h2>
              {data.status === "PENDING" ? (
                <span className="font-mono text-sm tabular-nums text-wait">
                  {countdown(data.expiresAt, now)}
                </span>
              ) : null}
            </div>
            <dl>
              <Field
                label="Agent"
                value={agent?.ens.name ?? agent?.name ?? data.agentId}
              />
              <Field label="Why it needs you" value={data.reason} />
              <Field label="Recipient" value={data.target} />
              <Field label="Token" value={data.token} />
              <Field
                label="Expires"
                value={new Date(data.expiresAt).toLocaleString()}
              />
              {data.decidedBy ? (
                <Field label="Decided by" value={data.decidedBy} />
              ) : null}
              {data.failureReason ? (
                <Field label="Failure" value={data.failureReason} />
              ) : null}
            </dl>
            {data.status === "PENDING" && unclaimed ? (
              <div className="mt-4">
                <p className="text-sm text-muted">
                  Nobody owns this agent yet. Claim it in World App first, then
                  come back to decide.
                </p>
                {insideWorldApp ? (
                  <Link
                    to="/mini"
                    className="mt-3 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
                  >
                    Claim in World App
                  </Link>
                ) : (
                  <OpenInWorldApp path="/mini" label="Claim in World App" />
                )}
              </div>
            ) : null}
            {data.status === "PENDING" && !unclaimed ? (
              <ApprovalActions approvalId={data.id} label={label} />
            ) : null}
          </Panel>
        ) : null}
      </QueryGate>
      {insideWorldApp ? (
        <Link to="/mini" className="mt-6 inline-block text-sm underline">
          Back to AgentLatch
        </Link>
      ) : (
        <Link to="/approvals" className="mt-6 inline-block text-sm underline">
          All approvals
        </Link>
      )}
    </>
  );
}

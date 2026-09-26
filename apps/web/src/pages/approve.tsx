import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAgents, useApproval, useMe } from "../hooks";
import { formatDollars } from "../model";
import {
  ApprovalActions,
  Field,
  PageHeader,
  Panel,
  Pill,
  QueryGate,
} from "../ui";
import { ClaimButton } from "./agents";

/** `?result=` values the World callback redirects back with. */
const outcomes: Record<string, { tone: "allow" | "block"; text: string }> = {
  paid: { tone: "allow", text: "Approved with World ID. The payment settled." },
  approved: { tone: "allow", text: "Approved with World ID. The action ran." },
  denied: {
    tone: "allow",
    text: "Denied with World ID. Nothing ran.",
  },
  deny_cancelled: {
    tone: "block",
    text: "You backed out of World ID. The approval is still waiting for your decision.",
  },
  cancelled: {
    tone: "block",
    text: "You cancelled on the World ID screen. Nothing ran.",
  },
  expired: {
    tone: "block",
    text: "The approval expired before World ID finished. Nothing ran.",
  },
  wrong_human: {
    tone: "block",
    text: "That World ID is not this agent's owner. The approval failed and nothing ran.",
  },
  stale: {
    tone: "block",
    text: "The World ID proof was not fresh. The approval failed and nothing ran.",
  },
  binding: {
    tone: "block",
    text: "The action changed after the approval was opened. Nothing ran.",
  },
  payment_failed: {
    tone: "block",
    text: "World ID passed, but the payment did not settle.",
  },
  passport_inactive: {
    tone: "block",
    text: "The agent's ENS name is missing or expired. The approval failed and nothing ran.",
  },
  passport_unread: {
    tone: "block",
    text: "The agent's ENS name could not be read. Nothing ran, and the approval is still pending. Try again.",
  },
  not_owner: {
    tone: "block",
    text: "Only this agent's owner can approve it. Claim the agent first.",
  },
  not_pending: { tone: "block", text: "This approval is already decided." },
  not_found: { tone: "block", text: "Approval not found." },
  signed_out: { tone: "block", text: "Sign in with World ID first." },
  invalid_attempt: {
    tone: "block",
    text: "That World ID response was stale or reused. Start again.",
  },
  invalid_ticket: {
    tone: "block",
    text: "World ID returned a ticket the server could not validate.",
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
  const me = useMe();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const outcome = result ? outcomes[result] : undefined;
  const data = approval.data;
  const agent = agents.data?.find((item) => item.id === data?.agentId);
  const label = data ? `${data.action} ${formatDollars(data.amountUsdc)}` : "";

  return (
    <>
      <PageHeader
        title="Approve one action"
        detail="Approve and deny each ask for a fresh World ID proof bound to this one decision on this one action. The server checks it before anything changes."
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
              <Field label="Purpose" value={data.reason} />
              <Field label="Recipient" value={data.target} />
              <Field label="Token" value={data.token} />
              <Field
                label="Expires"
                value={new Date(data.expiresAt).toLocaleString()}
              />
              {data.failureReason ? (
                <Field label="Failure" value={data.failureReason} />
              ) : null}
            </dl>
            {data.status === "PENDING" && me.data && agent && !agent.userId ? (
              <div className="mt-4">
                <p className="text-sm text-muted">
                  This agent has no owner yet. Claim it to approve with your
                  World ID.
                </p>
                <ClaimButton agentId={agent.id} />
              </div>
            ) : null}
            {data.status === "PENDING" ? (
              <ApprovalActions approvalId={data.id} label={label} />
            ) : null}
          </Panel>
        ) : null}
      </QueryGate>
      <Link to="/approvals" className="mt-6 inline-block text-sm underline">
        All approvals
      </Link>
    </>
  );
}

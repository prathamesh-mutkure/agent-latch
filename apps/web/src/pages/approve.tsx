import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ApprovalRecord } from "../api";
import { useAgents, useApproval } from "../hooks";
import { formatDollars } from "../model";
import {
  ApprovalActions,
  Field,
  PageHeader,
  Panel,
  Pill,
  QueryGate,
} from "../ui";
import { insideWorldApp } from "../world";

type Outcome = { tone: "allow" | "block"; text: string };

const failures: Record<string, string> = {
  BINDING: "The action changed after the approval opened. Nothing ran.",
  PAYMENT_FAILED: "World ID approved, but the payment did not settle.",
  PASSPORT_INACTIVE: "The agent's ENS name is missing or expired. Nothing ran.",
};

function outcomeOf(data: ApprovalRecord): Outcome | null {
  switch (data.status) {
    case "APPROVED":
      return {
        tone: "allow",
        text:
          data.action === "X402_PAYMENT"
            ? "Approved and confirmed with World ID. The payment settled."
            : "Approved and confirmed with World ID. The action ran.",
      };
    case "REJECTED":
      return {
        tone: "allow",
        text:
          data.worldIdStatus === "DENIED"
            ? "Denied on World ID. Nothing ran."
            : "Denied. Nothing ran.",
      };
    case "EXPIRED":
      return {
        tone: "block",
        text: "The approval expired before World ID confirmed it. Nothing ran.",
      };
    case "FAILED":
      return {
        tone: "block",
        text:
          (data.failureReason && failures[data.failureReason]) ??
          "The approval failed. Nothing ran.",
      };
    default:
      return null;
  }
}

const worldIdLabels: Record<string, string> = {
  WAITING: "Waiting for the owner to finish World ID",
  VERIFIED: "Fresh proof verified by the API",
  DENIED: "Denied on World ID",
  EXPIRED: "Expired before anyone approved",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
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
  const approval = useApproval(approvalId);
  const agents = useAgents();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const data = approval.data;
  const outcome = data ? outcomeOf(data) : null;
  const agent = agents.data?.find((item) => item.id === data?.agentId);
  const label = data ? `${data.action} ${formatDollars(data.amountUsdc)}` : "";

  return (
    <>
      <PageHeader
        title="Approve one action"
        detail="The agent went past its rules. Deny, or approve with your World App signature and a fresh World ID check. Nothing runs until the API has validated World ID's answer."
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
              {data.worldIdStatus ? (
                <Field
                  label="World ID for Agents"
                  value={
                    data.worldIdError
                      ? `${worldIdLabels[data.worldIdStatus] ?? data.worldIdStatus}: ${data.worldIdError}`
                      : (worldIdLabels[data.worldIdStatus] ??
                        data.worldIdStatus)
                  }
                />
              ) : null}
              {data.decidedBy ? (
                <Field label="Decided by" value={data.decidedBy} />
              ) : null}
              {data.failureReason ? (
                <Field label="Failure" value={data.failureReason} />
              ) : null}
            </dl>
            {data.status === "PENDING" ? (
              <ApprovalActions
                approvalId={data.id}
                label={label}
                worldIdStatus={data.worldIdStatus}
                worldIdError={data.worldIdError}
              />
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

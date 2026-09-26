import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { confirmStepUp, type StepUpStatus, stepUpStatus } from "../api";
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
  weak: {
    tone: "block",
    text: "World ID did not return an orb proof. Nothing ran.",
  },
  world_closed: {
    tone: "block",
    text: "World ID closed that request before you confirmed it. Nothing ran. You can start again.",
  },
};

function worldWaitCopy(status: string): string {
  if (
    status === "waiting_for_connection" ||
    status === "awaiting_confirmation"
  ) {
    return "Approve the request in World ID app. This page applies it after World ID says you confirmed.";
  }
  if (status === "verified") {
    return "Confirm the approval on the World ID page. It does not finish from this tab.";
  }
  return "The World ID window uses the account you signed in with. Nothing runs until you confirm on this page.";
}

function WorldHandoff({
  status,
  error,
  pending,
  onConfirm,
  confirming,
}: {
  status: StepUpStatus | undefined;
  error: unknown;
  pending: boolean;
  onConfirm: () => void;
  confirming: boolean;
}) {
  if (error) {
    return (
      <p className="mt-4 text-sm text-block" role="alert">
        {error instanceof Error ? error.message : "Could not check World ID."}
      </p>
    );
  }
  if (pending && !status) {
    return (
      <p className="mt-4 text-sm text-muted" role="status">
        Checking World ID.
      </p>
    );
  }
  if (!status || status.phase === "idle") {
    return (
      <p className="mt-4 text-sm text-muted" role="status">
        Starting World ID. Confirm the approval in the window that opened.
      </p>
    );
  }
  if (status.phase === "done") {
    return (
      <p className="mt-4 text-sm text-muted" role="status">
        World ID finished. Applying your decision.
      </p>
    );
  }
  if (status.phase === "confirm") {
    const label =
      status.decision === "deny" ? "Confirm denial" : "Confirm approval";
    return (
      <div className="mt-4 flex flex-col items-start gap-3">
        <p className="text-sm text-muted" role="status">
          World ID matches the owner. Confirm here before anything runs.
        </p>
        <button
          type="button"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          disabled={confirming}
          onClick={onConfirm}
        >
          {confirming ? "Confirming…" : label}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <p className="text-sm text-muted" role="status">
        {worldWaitCopy(status.worldStatus)}
      </p>
      {status.humanUrl ? (
        <a
          href={status.humanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Open World ID approval
        </a>
      ) : null}
      {status.connectorUri ? (
        <a
          href={status.connectorUri}
          className="text-sm underline"
          rel="noopener noreferrer"
        >
          Open World ID app
        </a>
      ) : null}
    </div>
  );
}

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
  const { result, handoff } = useSearch({ from: "/approve/$approvalId" });
  const navigate = useNavigate();
  const approval = useApproval(approvalId);
  const stepUp = useQuery({
    queryKey: ["world-step-up", approvalId],
    queryFn: stepUpStatus,
    enabled: handoff === "1" && !result,
    refetchInterval: (query) =>
      query.state.data?.phase === "done" ? false : 2000,
  });
  useEffect(() => {
    const status = stepUp.data;
    if (status?.phase !== "done") {
      return;
    }
    void navigate({
      to: "/approve/$approvalId",
      params: { approvalId },
      search: { result: status.result },
      replace: true,
    });
  }, [approvalId, navigate, stepUp.data]);
  const agents = useAgents();
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  async function confirm() {
    setConfirmError(null);
    setConfirming(true);
    try {
      const next = await confirmStepUp();
      await navigate({
        to: "/approve/$approvalId",
        params: { approvalId },
        search: { result: next },
        replace: true,
      });
    } catch (caught) {
      setConfirmError(
        caught instanceof Error ? caught.message : "Could not confirm.",
      );
    } finally {
      setConfirming(false);
    }
  }
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
            {handoff === "1" && !result && data.status === "PENDING" ? (
              <>
                <WorldHandoff
                  status={stepUp.data}
                  error={stepUp.error}
                  pending={stepUp.isPending}
                  confirming={confirming}
                  onConfirm={() => void confirm()}
                />
                {confirmError ? (
                  <p role="alert" className="mt-3 text-sm text-block">
                    {confirmError}
                  </p>
                ) : null}
              </>
            ) : null}
            {data.status === "PENDING" &&
            !(
              handoff === "1" &&
              !result &&
              (stepUp.isPending ||
                stepUp.data?.phase === "waiting" ||
                stepUp.data?.phase === "confirm" ||
                stepUp.data?.phase === "done")
            ) ? (
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

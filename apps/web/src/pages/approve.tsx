import type { WorldIdCheckStatus } from "@agentlatch/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import {
  type ApprovalRecord,
  type Decision,
  decideApproval,
  getDecisionChallenge,
  type WorldIdPrompt,
} from "../api";
import { useAgents, useApproval, useWorldConfig } from "../hooks";
import { formatDollars } from "../model";
import { Field, PageHeader, Panel, Pill, QueryGate } from "../ui";
import { insideWorldApp, miniAppUrl, signInWorldApp } from "../world";

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

/** Deciding happens only in the World App mini app. */
export function ApprovePage() {
  return insideWorldApp ? <MiniApproval /> : <ApproveOnPhone />;
}

/** On a computer: status only, plus a QR code that opens this page in World App. */
function ApproveOnPhone() {
  const { approvalId } = useParams({ from: "/approve/$approvalId" });
  const approval = useApproval(approvalId);
  const config = useWorldConfig();
  const appId = config.data?.appId;
  const data = approval.data;
  const outcome = data ? outcomeOf(data) : null;

  return (
    <>
      <PageHeader
        title="Decide on your phone"
        detail="Approvals are decided in World App by the agent's owner. Scan the code with your phone's camera to open this approval there."
      />
      <Panel>
        {data ? (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Pill>{data.status}</Pill>
            <p className="text-xl font-semibold tabular-nums">
              {data.action} {formatDollars(data.amountUsdc)}
            </p>
          </div>
        ) : null}
        {outcome ? (
          <p
            role="status"
            className={`text-sm ${outcome.tone === "allow" ? "text-allow" : "text-block"}`}
          >
            {outcome.text}
          </p>
        ) : appId ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG
                value={miniAppUrl(appId, `/approve/${approvalId}`)}
                size={184}
                marginSize={0}
              />
            </div>
            <p className="max-w-xs text-sm text-muted">
              Nothing can be approved from this computer. This page updates by
              itself once you decide on the phone.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {config.isPending
              ? "Loading…"
              : "Set WORLD_APP_ID on the API to use World App."}
          </p>
        )}
      </Panel>
      <Link to="/approvals" className="mt-6 inline-block text-sm underline">
        All approvals
      </Link>
    </>
  );
}

function MiniApproval() {
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
              <WorldAppDecision
                approvalId={data.id}
                label={label}
                worldIdStatus={data.worldIdStatus}
                worldIdError={data.worldIdError}
              />
            ) : null}
          </Panel>
        ) : null}
      </QueryGate>
      <Link to="/mini" className="mt-6 inline-block text-sm underline">
        Back to home
      </Link>
    </>
  );
}

function WorldAppDecision({
  approvalId,
  label,
  worldIdStatus,
  worldIdError,
}: {
  approvalId: string;
  label: string;
  worldIdStatus: WorldIdCheckStatus | null;
  worldIdError: string | null;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Decision | null>(null);
  const [prompt, setPrompt] = useState<WorldIdPrompt | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setNote(null);
    setError(null);
    setBusy(decision);
    try {
      const challenge = await getDecisionChallenge(approvalId, decision);
      const signed = await signInWorldApp(challenge);
      if (!signed) {
        setNote("You closed the World App prompt. Nothing changed.");
        return;
      }
      const outcome = await decideApproval(approvalId, decision, signed);
      setPrompt(outcome.result === "verify" ? outcome.worldId : null);
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The decision did not go through.",
      );
    } finally {
      setBusy(null);
    }
  }

  const verifying = prompt !== null && worldIdStatus === "WAITING";
  const lastCheckEnded =
    !verifying && worldIdError && worldIdStatus !== "WAITING";

  return (
    <div className="mt-4 grid gap-3">
      {verifying ? <WorldIdStep prompt={prompt} /> : null}
      {lastCheckEnded ? (
        <p role="status" className="text-sm text-block">
          World ID did not approve: {worldIdError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {verifying ? null : (
          <button
            type="button"
            className="flex-1 rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
            aria-label={`Approve ${label}`}
            disabled={busy !== null}
            onClick={() => void decide("approve")}
          >
            {busy === "approve"
              ? "Signing…"
              : worldIdStatus === "WAITING"
                ? "Continue with World ID"
                : "Approve with World ID"}
          </button>
        )}
        <button
          type="button"
          className="flex-1 rounded-md border border-block px-4 py-3 text-sm font-medium text-block disabled:opacity-50"
          aria-label={`Deny ${label}`}
          disabled={busy !== null}
          onClick={() => void decide("deny")}
        >
          {busy === "deny" ? "Signing…" : "Deny"}
        </button>
      </div>
      {note ? (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-block">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The person checks the code on World ID, proves, and approves or denies there. */
function WorldIdStep({ prompt }: { prompt: WorldIdPrompt }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="text-sm font-medium">Confirm with World ID</p>
      <p className="mt-1 text-sm text-muted">
        Open World ID, check that it shows this code, then tap Authenticate with
        World ID. Tap Deny there to stop the action.
      </p>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-widest">
        {prompt.userCode}
      </p>
      <a
        href={prompt.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block rounded-md bg-ink px-4 py-3 text-center text-sm font-medium text-paper"
      >
        Open World ID
      </a>
      <p role="status" className="mt-3 text-sm text-muted">
        Waiting for World ID. This page updates by itself when you come back.
      </p>
    </div>
  );
}

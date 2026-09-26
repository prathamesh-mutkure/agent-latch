import type { WorldIdCheckStatus } from "@agentlatch/core";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  type Decision,
  decideApproval,
  getDecisionChallenge,
  type WorldIdPrompt,
} from "./api";
import { useWorldConfig } from "./hooks";
import { insideWorldApp, miniAppUrl, signInWorldApp } from "./world";

export function toneFor(kind: string): "allow" | "block" | "wait" | "neutral" {
  if (
    kind === "ALLOW" ||
    kind === "APPROVED" ||
    kind === "EXECUTED" ||
    kind === "RUNNING" ||
    kind === "Low" ||
    kind === "REGISTERED"
  ) {
    return "allow";
  }
  if (
    kind === "BLOCK" ||
    kind === "BLOCKED" ||
    kind === "REJECTED" ||
    kind === "FAILED" ||
    kind === "CANCELLED" ||
    kind === "High"
  ) {
    return "block";
  }
  if (
    kind === "HUMAN_APPROVAL" ||
    kind === "PENDING" ||
    kind === "AWAITING_APPROVAL" ||
    kind === "WAITING" ||
    kind === "Medium"
  ) {
    return "wait";
  }
  return "neutral";
}

const toneClass = {
  allow: "bg-allow-soft text-allow",
  block: "bg-block-soft text-block",
  wait: "bg-wait-soft text-wait",
  neutral: "bg-line text-ink",
} as const;

export function Pill({ children }: { children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide ${toneClass[toneFor(children)]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      {detail ? <p className="mt-2 max-w-2xl text-muted">{detail}</p> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      {title ? (
        <h2 className="mb-4 text-sm font-medium tracking-wide text-muted">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium tabular-nums text-ink">
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm text-muted">{detail}</p> : null}
    </div>
  );
}

export function QueryGate({
  isPending,
  error,
  hasData,
  children,
}: {
  isPending: boolean;
  error: unknown;
  hasData: boolean;
  children: ReactNode;
}) {
  if (isPending && !hasData) {
    return <p className="text-muted">Loading…</p>;
  }
  if (error && !hasData) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return <p className="text-block">{message}</p>;
  }
  return children;
}

export function Empty({ children }: { children: string }) {
  return <p className="text-muted">{children}</p>;
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-mono text-sm break-all text-ink">{value}</dd>
    </div>
  );
}

/** Link that opens a mini app page in World App. Outside World App only. */
export function OpenInWorldApp({
  path,
  label,
  detail,
}: {
  path: string;
  label: string;
  detail?: string;
}) {
  const config = useWorldConfig();
  const appId = config.data?.appId;
  if (config.isPending) {
    return null;
  }
  if (!appId) {
    return (
      <p className="mt-4 text-sm text-muted">
        Set WORLD_APP_ID on the API to use World App.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <a
        href={miniAppUrl(appId, path)}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
      >
        {label}
      </a>
      {detail ? <p className="text-sm text-muted">{detail}</p> : null}
    </div>
  );
}

/**
 * Deny is one World App signature. Approve is a World App signature from the
 * wallet that owns the agent, then a fresh World ID for Agents check that the
 * API validates before the action runs. Outside World App the page only links
 * there.
 */
export function ApprovalActions({
  approvalId,
  label,
  worldIdStatus = null,
  worldIdError = null,
}: {
  approvalId: string;
  label: string;
  worldIdStatus?: WorldIdCheckStatus | null;
  worldIdError?: string | null;
}) {
  if (!insideWorldApp) {
    return (
      <OpenInWorldApp
        path={`/approve/${approvalId}`}
        label="Decide in World App"
        detail={
          worldIdStatus === "WAITING"
            ? "The owner signed Approve and is finishing World ID."
            : "The agent's owner approves or denies in World App, from the push or the approvals list."
        }
      />
    );
  }
  return (
    <WorldAppDecision
      approvalId={approvalId}
      label={label}
      worldIdStatus={worldIdStatus}
      worldIdError={worldIdError}
    />
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

import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useMe } from "./hooks";

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

/** Approve and deny each need a fresh World ID proof from the agent's owner. */
export function ApprovalActions({
  approvalId,
  label,
}: {
  approvalId: string;
  label: string;
}) {
  const me = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    setError(null);
    setBusy(decision);
    const popup = window.open("", "agentlatch-world");
    try {
      const response = await fetch(
        `/auth/world/step-up?approval=${approvalId}&decision=${decision}`,
        {
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "1",
          },
        },
      );
      const body = (await response.json()) as {
        humanUrl?: string;
        result?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "World ID did not start.");
      }
      if (body.result) {
        popup?.close();
        await navigate({
          to: "/approve/$approvalId",
          params: { approvalId },
          search: { result: body.result },
        });
        return;
      }
      if (body.humanUrl && popup) {
        popup.location.href = body.humanUrl;
      } else {
        popup?.close();
      }
      await navigate({
        to: "/approve/$approvalId",
        params: { approvalId },
        search: { handoff: "1" },
      });
    } catch (caught) {
      popup?.close();
      setError(
        caught instanceof Error ? caught.message : "World ID did not start.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!me.data) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/auth/world/login"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Sign in with World ID to decide
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        aria-label={`Approve ${label} with World ID`}
        disabled={busy !== null}
        onClick={() => void decide("approve")}
      >
        {busy === "approve" ? "Opening World ID…" : "Approve with World ID"}
      </button>
      <button
        type="button"
        className="rounded-md border border-block px-4 py-2 text-sm font-medium text-block disabled:opacity-50"
        aria-label={`Deny ${label} with World ID`}
        disabled={busy !== null}
        onClick={() => void decide("deny")}
      >
        {busy === "deny" ? "Opening World ID…" : "Deny with World ID"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-block">
          {error}
        </p>
      ) : null}
    </div>
  );
}

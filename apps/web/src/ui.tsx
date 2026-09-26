import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useWorldConfig } from "./hooks";
import { miniAppUrl } from "./world";

export function toneFor(kind: string): "allow" | "block" | "wait" | "neutral" {
  if (
    kind === "ALLOW" ||
    kind === "APPROVED" ||
    kind === "EXECUTED" ||
    kind === "RUNNING" ||
    kind === "Low" ||
    kind === "VERIFIED" ||
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
    kind === "EXPIRED" ||
    kind === "DENIED" ||
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

/** `HUMAN_APPROVAL` reads as "Human approval". Tone still keys off the raw value. */
export function humanize(kind: string): string {
  const text = kind.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Pill({ children }: { children: string }) {
  return (
    <span
      title={children}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${toneClass[toneFor(children)]}`}
    >
      {humanize(children)}
    </span>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="w-fit rounded-md border border-ink px-3 py-1.5 text-sm font-medium"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const TX_HASH = /(0x[0-9a-fA-F]{64})/;

/** Text with any transaction hash linked to Sepolia Etherscan. */
export function TxText({ text }: { text: string }) {
  return text.split(TX_HASH).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={part}
        href={`https://sepolia.etherscan.io/tx/${part}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono underline"
      >
        {part.slice(0, 10)}…{part.slice(-6)}
      </a>
    ) : (
      part
    ),
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
 * Approvals are decided only in the World App mini app, on `/approve/:id`.
 * On the computer that page shows a QR code to open it on the phone.
 */
export function DecideOnPhone({ approvalId }: { approvalId: string }) {
  return (
    <Link
      to="/approve/$approvalId"
      params={{ approvalId }}
      className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
    >
      Decide on your phone
    </Link>
  );
}

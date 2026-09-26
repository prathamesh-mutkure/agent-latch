import { formatUsdc } from "@agentlatch/core";

export function formatDollars(usdc: string): string {
  const negative = usdc.startsWith("-");
  const absolute = negative ? usdc.slice(1) : usdc;
  const [whole = "0", fraction] = absolute.split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  const text = fraction ? `$${grouped}.${fraction}` : `$${grouped}`;
  return negative ? `-${text}` : text;
}

export function formatBaseUnits(baseUnits: string): string {
  return formatDollars(formatUsdc(baseUnits));
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function latestByTime<T extends { createdAt: string }>(
  items: T[],
): T | null {
  return items.reduce<T | null>((latest, item) => {
    if (!latest || item.createdAt > latest.createdAt) {
      return item;
    }
    return latest;
  }, null);
}

export function formatExpiry(iso: string, now = Date.now()): string {
  const delta = new Date(iso).getTime() - now;
  if (delta <= 0) {
    return "Expired";
  }
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) {
    return "Expires in under a minute";
  }
  if (minutes === 1) {
    return "Expires in 1 minute";
  }
  return `Expires in ${minutes} minutes`;
}

export function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** Pairing codes read as `ABCD-EFGH` on both screens. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function roleLabel(role: string): string {
  return role
    .replace(/^ROLE_/, "")
    .toLowerCase()
    .replaceAll("_", " ");
}

export function spentToday(
  actions: { status: string; amountBaseUnits: string; createdAt: string }[],
  now = new Date(),
): bigint {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return actions.reduce((sum, action) => {
    if (action.status !== "EXECUTED") {
      return sum;
    }
    if (new Date(action.createdAt).getTime() < startMs) {
      return sum;
    }
    return sum + BigInt(action.amountBaseUnits);
  }, 0n);
}

const RUNNING_WINDOW_MS = 45_000;

export function agentPosture(
  actions: { status: string; createdAt: string }[],
  now = Date.now(),
): "RUNNING" | "WAITING" | "IDLE" {
  if (actions.some((action) => action.status === "AWAITING_APPROVAL")) {
    return "WAITING";
  }
  const latest = actions.reduce<number | null>((newest, action) => {
    const time = new Date(action.createdAt).getTime();
    return newest === null || time > newest ? time : newest;
  }, null);
  if (latest !== null && now - latest <= RUNNING_WINDOW_MS) {
    return "RUNNING";
  }
  return "IDLE";
}

export function riskLabel(input: {
  pendingBaseUnits: string | null;
  hardLimitUsdc: string | null;
  latestStatus: string | null;
}): { level: "Low" | "Medium" | "High"; detail: string } {
  if (input.pendingBaseUnits) {
    if (input.hardLimitUsdc) {
      const pending = BigInt(input.pendingBaseUnits);
      const hard = BigInt(formatUsdcToBase(input.hardLimitUsdc));
      if (hard > 0n && pending * 2n >= hard) {
        return {
          level: "High",
          detail: "The pending action is at least half the hard limit.",
        };
      }
    }
    return {
      level: "Medium",
      detail: "A pending action is above the autonomous limit.",
    };
  }
  if (input.latestStatus === "BLOCKED") {
    return { level: "High", detail: "The latest action was blocked." };
  }
  if (input.latestStatus === "EXECUTED") {
    return { level: "Low", detail: "The latest action stayed inside policy." };
  }
  if (input.latestStatus === "REJECTED" || input.latestStatus === "EXPIRED") {
    return { level: "Medium", detail: "The latest action did not execute." };
  }
  return { level: "Low", detail: "No actions yet." };
}

function formatUsdcToBase(usdc: string): string {
  const [whole = "0", fraction = ""] = usdc.split(".");
  const padded = fraction.padEnd(6, "0").slice(0, 6);
  return (BigInt(whole) * 1_000_000n + BigInt(padded || "0")).toString();
}

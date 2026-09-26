import { formatUsdc } from "@agentlatch/core";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { agents } from "../agents/schema";
import { approvals } from "../approvals/schema";
import { getUser } from "../users/service";

const SEND_URL =
  "https://developer.worldcoin.org/api/v2/minikit/send-notification";

type Notice = {
  userId: string | null;
  title: string;
  message: string;
  path: string;
};

/** Pushes a World App notification. A missing key or wallet does not fail the action. */
export async function notifyOwner(notice: Notice): Promise<void> {
  const appId = process.env.WORLD_APP_ID?.trim();
  const apiKey = process.env.WORLD_NOTIFICATION_API_KEY?.trim();
  if (!notice.userId || !appId || !apiKey) {
    return;
  }
  const user = await getUser(notice.userId);
  if (!user?.worldWallet) {
    return;
  }

  const path = notice.path.startsWith("/") ? notice.path : `/${notice.path}`;
  try {
    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: appId,
        wallet_addresses: [user.worldWallet],
        title: clip(notice.title, 30),
        message: clip(notice.message, 200),
        mini_app_path: `worldapp://mini-app?app_id=${appId}&path=${path}`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.log(`world notification ${response.status}`);
    }
  } catch (error) {
    console.log(
      `world notification failed: ${error instanceof Error ? error.message : "error"}`,
    );
  }
}

export async function notifyAction(input: {
  userId: string | null;
  decision: "ALLOW" | "BLOCK" | "HUMAN_APPROVAL";
  action: string;
  amount: string;
  approvalId: string | null;
}): Promise<void> {
  const amount = `${formatUsdc(input.amount)} USDC`;
  if (input.decision === "HUMAN_APPROVAL" && input.approvalId) {
    await notifyOwner({
      userId: input.userId,
      title: "Approval needed",
      message: `${input.action} ${amount} needs your approval.`,
      path: `/approve/${input.approvalId}`,
    });
    return;
  }
  if (input.decision === "ALLOW") {
    await notifyOwner({
      userId: input.userId,
      title: "Action allowed",
      message: `${input.action} ${amount} ran on its own.`,
      path: "/mini",
    });
    return;
  }
  await notifyOwner({
    userId: input.userId,
    title: "Action blocked",
    message: `${input.action} ${amount} was blocked.`,
    path: "/mini",
  });
}

/** Status push after a World step-up actually approves or denies. */
export async function notifyDecision(
  approvalId: string,
  result: "paid" | "approved" | "denied",
): Promise<void> {
  const rows = await db
    .select({
      userId: agents.userId,
      action: approvals.action,
      amount: approvals.amount,
    })
    .from(approvals)
    .innerJoin(agents, eq(approvals.agentId, agents.id))
    .where(eq(approvals.id, approvalId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return;
  }
  const amount = `${formatUsdc(row.amount)} USDC`;
  const approved = result === "paid" || result === "approved";
  await notifyOwner({
    userId: row.userId,
    title: approved ? "You approved" : "You denied",
    message: approved
      ? `${row.action} ${amount} ran.`
      : `${row.action} ${amount} did not run.`,
    path: "/mini",
  });
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

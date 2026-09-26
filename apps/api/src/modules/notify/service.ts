import { formatUsdc } from "@agentlatch/core";
import { sendNotification } from "@agentlatch/world";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { agents } from "../agents/schema";
import { users } from "../users/schema";

/**
 * Asks the agent's owner to decide one approval, with a World App push that
 * opens it in the mini app. Only approvals push: unverified mini apps get 40
 * pushes per 4 hours. Never throws; the approval stays open in the mini app
 * whether or not the push arrives.
 */
export async function notifyApproval(input: {
  agentId: string;
  approvalId: string;
  action: string;
  amount: string;
}): Promise<void> {
  const appId = process.env.WORLD_APP_ID?.trim();
  const apiKey = process.env.WORLD_NOTIFICATION_API_KEY?.trim();
  if (!appId || !apiKey) {
    console.log(
      "world push skipped: set WORLD_APP_ID and WORLD_NOTIFICATION_API_KEY",
    );
    return;
  }
  try {
    const rows = await db
      .select({ name: agents.name, wallet: users.worldWallet })
      .from(agents)
      .innerJoin(users, eq(agents.userId, users.id))
      .where(eq(agents.id, input.agentId))
      .limit(1);
    const owner = rows[0];
    if (!owner) {
      console.log(`world push skipped: agent ${input.agentId} has no owner`);
      return;
    }
    const result = await sendNotification({
      appId,
      apiKey,
      wallet: owner.wallet,
      title: "Approval needed",
      message: `${owner.name} wants to ${input.action} ${formatUsdc(input.amount)} USDC. Tap to approve or deny.`,
      path: `/approve/${input.approvalId}`,
    });
    console.log(
      result.sent
        ? `world push sent for approval ${input.approvalId}`
        : `world push not sent for approval ${input.approvalId}: ${result.reason}`,
    );
  } catch (error) {
    console.log(
      `world push failed: ${error instanceof Error ? error.message : "error"}`,
    );
  }
}

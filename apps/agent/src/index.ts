import { type ApprovalResult, apiHealth, getApproval, submitSwap } from "./api";
import { agentId, agentKey, intervalMs, pollMs } from "./env";
import { nextTick } from "./market";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi(): Promise<void> {
  for (;;) {
    try {
      const health = await apiHealth();
      if (health.ok && health.database === "up") {
        return;
      }
    } catch {
      // API process is not up yet.
    }
    console.log("agent waiting for api");
    await sleep(1_000);
  }
}

async function waitForDecision(approvalId: string): Promise<ApprovalResult> {
  for (;;) {
    const approval = await getApproval(approvalId);
    if (approval.status !== "PENDING") {
      return approval;
    }
    console.log(`agent waiting for human approval ${approvalId}`);
    await sleep(pollMs);
  }
}

async function run(): Promise<void> {
  if (!agentId || !agentKey) {
    console.log(
      "agent idle: set AGENT_ID and AGENT_KEY from the agent's page in the dashboard",
    );
    return;
  }
  await waitForApi();
  console.log(`agent ${agentId}`);

  for (;;) {
    const tick = nextTick();
    console.log(
      `agent observed ${tick.note}; request SWAP ${tick.amount} USDC`,
    );
    try {
      const action = await submitSwap(agentId, tick.amount, tick.note);
      console.log(
        `agent ${action.decision} ${action.amountUsdc} USDC — ${action.reasons[0] ?? action.status}`,
      );
      if (action.decision === "HUMAN_APPROVAL" && action.approvalRequestId) {
        const approval = await waitForDecision(action.approvalRequestId);
        console.log(`agent approval ${approval.status}`);
      }
    } catch (error) {
      console.error("agent request failed", error);
    }
    await sleep(intervalMs);
  }
}

if (import.meta.main) {
  await run();
}

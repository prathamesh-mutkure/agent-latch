import {
  type ApprovalResult,
  apiHealth,
  createAgent,
  getApproval,
  listAgents,
  setDemoPolicy,
  submitSwap,
} from "./api";
import { agentName, intervalMs, pollMs } from "./env";
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

async function ensureAgent(): Promise<string> {
  const agents = await listAgents();
  const existing = agents.find((agent) => agent.name === agentName);
  const agent = existing ?? (await createAgent(agentName));
  await setDemoPolicy(agent.id);
  console.log(`agent ${agent.name} ${agent.id} policy 500/5000 USDC`);
  return agent.id;
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
  await waitForApi();
  const agentId = await ensureAgent();

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

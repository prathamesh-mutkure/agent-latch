import type {
  ActionRequest,
  Agent,
  ApprovalRequest,
  Policy,
  SimulatedExecution,
} from "@agentlatch/core";

const agents = new Map<string, Agent>();
const policies = new Map<string, Policy>();
const actions: ActionRequest[] = [];
const approvals = new Map<string, ApprovalRequest>();
const executions = new Map<string, SimulatedExecution>();

/** Process-local store. Restarting the API clears it. Phase 2 replaces this. */
export const memory = {
  agents,
  policies,
  actions,
  approvals,
  executions,
};

import { type Agent, formatUsdc, type Policy } from "@agentlatch/core";
import {
  type EnsIdentity,
  publishPolicyOnName,
  readPolicyTexts,
  readUnderParent,
  registerUnderParent,
  sepoliaEns,
} from "@agentlatch/ens";
import { policyChange, policyFromTexts } from "./published";

export type AgentEns = EnsIdentity;

/** What locates an agent's name: `name.username.<parent>`, or `name.<parent>`. */
export type AgentName = Pick<Agent, "name" | "username">;

function rpcUrl() {
  return process.env.SEPOLIA_RPC_URL ?? sepoliaEns.defaultRpcUrl;
}

export function parentName() {
  return process.env.ENS_PARENT_NAME ?? sepoliaEns.defaultParentName;
}

function registry() {
  return process.env.ENS_REGISTRY_ADDRESS ?? sepoliaEns.ethRegistry;
}

function namespaceOf(agent: AgentName) {
  return agent.username ? `${agent.username}.${parentName()}` : parentName();
}

/** The agent id: the full ENS name, registered or not. */
export function agentEnsName(agent: AgentName): string {
  return `${agent.name}.${namespaceOf(agent)}`;
}

export function loadPolicyTexts(name: string) {
  return readPolicyTexts(name, rpcUrl());
}

export function readAgentEns(agent: AgentName): Promise<AgentEns> {
  return readUnderParent(agent.name, namespaceOf(agent), rpcUrl(), registry());
}

export function policyRecords(
  policy: Policy,
): { key: string; value: string }[] {
  return [
    {
      key: "policy.autonomousLimit",
      value: formatUsdc(policy.autonomousLimit),
    },
    { key: "policy.hardLimit", value: formatUsdc(policy.hardLimit) },
    {
      key: "policy.dailyLimit",
      value: policy.dailyLimit ? formatUsdc(policy.dailyLimit) : "none",
    },
    { key: "policy.actions", value: policy.allowedActions.join(",") },
    { key: "policy.tokens", value: "USDC" },
    {
      key: "policy.targets",
      value:
        policy.allowedTargets.length > 0
          ? policy.allowedTargets.join(",")
          : "any",
    },
  ];
}

export async function recordsToPublish(
  agent: AgentName,
  policy: Policy | undefined,
): Promise<{ key: string; value: string }[] | undefined> {
  if (!policy) {
    return undefined;
  }
  const identity = await readAgentEns(agent);
  if (identity.status === "UNAVAILABLE") {
    throw new Error(identity.detail ?? "ENS name could not be read.");
  }
  if (identity.status !== "REGISTERED" || !identity.name) {
    return policyRecords(policy);
  }
  const published = policyFromTexts(
    policy.agentId,
    await readPolicyTexts(identity.name, rpcUrl()),
  );
  if (!published || policyChange(published, policy) === "tighter") {
    return policyRecords(policy);
  }
  return undefined;
}

export async function publishPolicyRecords(
  agent: AgentName,
  records: { key: string; value: string }[],
): Promise<void> {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey?.startsWith("0x")) {
    throw new Error("EXECUTOR_PRIVATE_KEY is required to publish a policy.");
  }
  const identity = await readAgentEns(agent);
  if (!identity.name) {
    throw new Error("ENS name is not registered.");
  }
  await publishPolicyOnName({
    privateKey: privateKey as `0x${string}`,
    rpcUrl: rpcUrl(),
    registry: identity.registry,
    label: identity.label,
    name: identity.name,
    records,
  });
}

function executorKey(): `0x${string}` {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey?.startsWith("0x")) {
    throw new Error(
      "EXECUTOR_PRIVATE_KEY is required to register an ENS name.",
    );
  }
  return privateKey as `0x${string}`;
}

/**
 * Registers `name.username.<parent>`, first registering the owner's
 * `username.<parent>` if it is missing. The ETH record is the agent's signing
 * address when it has one.
 */
export async function registerAgentEns(
  agent: AgentName & { authAddress: string | null },
  owner?: string,
  records?: { key: string; value: string }[],
): Promise<AgentEns> {
  const privateKey = executorKey();
  if (agent.username) {
    const space = await readUnderParent(
      agent.username,
      parentName(),
      rpcUrl(),
      registry(),
    );
    if (space.status === "UNAVAILABLE") {
      throw new Error(space.detail ?? "ENS name could not be read.");
    }
    if (space.status !== "REGISTERED") {
      await registerUnderParent({
        parentName: parentName(),
        label: agent.username,
        privateKey,
        rpcUrl: rpcUrl(),
        parentRegistry: registry(),
      });
    }
  }
  return registerUnderParent({
    parentName: namespaceOf(agent),
    label: agent.name,
    owner,
    address: agent.authAddress ?? undefined,
    privateKey,
    rpcUrl: rpcUrl(),
    parentRegistry: registry(),
    records,
  });
}

/** A registration still running on Sepolia, or the last one that failed. */
export type EnsRegistration = {
  state: "REGISTERING" | "FAILED";
  error: string | null;
  startedAt: string;
};

// ponytail: in memory and one at a time. A restart forgets a running job (the
// owner registers again, which resumes where the chain left off), and two API
// processes could still race on the executor nonce.
const registrations = new Map<string, EnsRegistration>();
let queue: Promise<unknown> = Promise.resolve();

export function ensRegistration(agentId: string): EnsRegistration | null {
  return registrations.get(agentId) ?? null;
}

/**
 * Registration takes minutes of Sepolia transactions, longer than the proxy in
 * front of the API waits. This returns at once and runs the job in the
 * background. Jobs share the executor key, so they run one after another.
 */
export function startEnsRegistration(
  agentId: string,
  run: () => Promise<unknown>,
): EnsRegistration {
  const running = registrations.get(agentId);
  if (running?.state === "REGISTERING") {
    return running;
  }
  const job: EnsRegistration = {
    state: "REGISTERING",
    error: null,
    startedAt: new Date().toISOString(),
  };
  registrations.set(agentId, job);
  queue = queue.then(run).then(
    () => registrations.delete(agentId),
    (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "ENS registration failed.";
      console.error(`ens registration ${agentId} failed: ${message}`);
      registrations.set(agentId, {
        ...job,
        state: "FAILED",
        error: message.split("\n")[0]?.slice(0, 300) ?? message,
      });
    },
  );
  return job;
}

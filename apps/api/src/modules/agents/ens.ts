import { formatUsdc, type Policy } from "@agentlatch/core";
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

function rpcUrl() {
  return process.env.SEPOLIA_RPC_URL ?? sepoliaEns.defaultRpcUrl;
}

function parentName() {
  return process.env.ENS_PARENT_NAME ?? sepoliaEns.defaultParentName;
}

export function loadPolicyTexts(name: string) {
  return readPolicyTexts(name, rpcUrl());
}

export function readAgentEns(label: string): Promise<AgentEns> {
  return readUnderParent(
    label,
    parentName(),
    rpcUrl(),
    process.env.ENS_REGISTRY_ADDRESS ?? sepoliaEns.ethRegistry,
  );
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
  label: string,
  policy: Policy | undefined,
): Promise<{ key: string; value: string }[] | undefined> {
  if (!policy) {
    return undefined;
  }
  const identity = await readAgentEns(label);
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
  label: string,
  records: { key: string; value: string }[],
): Promise<void> {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey?.startsWith("0x")) {
    throw new Error("EXECUTOR_PRIVATE_KEY is required to publish a policy.");
  }
  const identity = await readAgentEns(label);
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

export function registerAgentEns(
  label: string,
  owner?: string,
  records?: { key: string; value: string }[],
): Promise<AgentEns> {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey?.startsWith("0x")) {
    throw new Error(
      "EXECUTOR_PRIVATE_KEY is required to register an ENS name.",
    );
  }
  return registerUnderParent({
    parentName: parentName(),
    label,
    owner,
    privateKey: privateKey as `0x${string}`,
    rpcUrl: rpcUrl(),
    parentRegistry: process.env.ENS_REGISTRY_ADDRESS ?? sepoliaEns.ethRegistry,
    records,
  });
}

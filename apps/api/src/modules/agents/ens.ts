import {
  type EnsIdentity,
  readUnderParent,
  registerUnderParent,
  sepoliaEns,
} from "@agentlatch/ens";

export type AgentEns = EnsIdentity;

function rpcUrl() {
  return process.env.SEPOLIA_RPC_URL ?? sepoliaEns.defaultRpcUrl;
}

function parentName() {
  return process.env.ENS_PARENT_NAME ?? sepoliaEns.defaultParentName;
}

export function readAgentEns(label: string): Promise<AgentEns> {
  return readUnderParent(
    label,
    parentName(),
    rpcUrl(),
    process.env.ENS_REGISTRY_ADDRESS ?? sepoliaEns.ethRegistry,
  );
}

export function registerAgentEns(
  label: string,
  owner?: string,
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
  });
}

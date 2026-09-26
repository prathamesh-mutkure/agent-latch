import {
  type EnsIdentity,
  registerEnsSubname,
  resolveEnsIdentity,
  sepoliaEns,
} from "@agentlatch/ens";

export type AgentEns = EnsIdentity;

function ensOptions() {
  return {
    rpcUrl: process.env.SEPOLIA_RPC_URL ?? sepoliaEns.defaultRpcUrl,
    registryAddress: process.env.ENS_REGISTRY_ADDRESS,
  };
}

export function readAgentEns(label: string): Promise<AgentEns> {
  return resolveEnsIdentity(label, ensOptions());
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
  return registerEnsSubname({
    label,
    owner,
    privateKey: privateKey as `0x${string}`,
    ...ensOptions(),
  });
}

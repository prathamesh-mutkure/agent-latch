import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  isAddress,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  permissionedRegistryAbi,
  registrationRoleBitmap,
  registryRoles,
  sepoliaEns,
} from "./config";
import { resolveNameWithSdk } from "./sdk";

const nameStatuses = ["AVAILABLE", "RESERVED", "REGISTERED"] as const;

export type EnsNameStatus = (typeof nameStatuses)[number] | "UNAVAILABLE";

export type EnsRole = {
  role: keyof typeof registryRoles;
  granted: boolean;
};

export type EnsIdentity = {
  name: string | null;
  label: string;
  namespace: string | null;
  status: EnsNameStatus;
  owner: Address | null;
  tokenId: string | null;
  expiry: string | null;
  registry: Address;
  /** ETH address record from ENSjs. Null when the name has no addr record. */
  address: Address | null;
  roles: EnsRole[];
  detail: string | null;
};

export type EnsClientOptions = {
  rpcUrl?: string;
  registryAddress?: string;
};

function normalizeLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function labelId(label: string): bigint {
  return BigInt(keccak256(toBytes(label)));
}

function clientFor(options: EnsClientOptions) {
  const configured = options.registryAddress ?? sepoliaEns.ethRegistry;
  if (!isAddress(configured)) {
    throw new Error("ENS_REGISTRY_ADDRESS is not an address.");
  }
  const client = createPublicClient({
    chain: sepolia,
    transport: http(options.rpcUrl ?? sepoliaEns.defaultRpcUrl),
  });
  return { client, registry: configured };
}

async function nameSuffix(
  client: ReturnType<typeof clientFor>["client"],
  registry: Address,
  depth = 0,
): Promise<string> {
  if (depth > 6) {
    return "";
  }
  try {
    const parent = await client.readContract({
      address: registry,
      abi: permissionedRegistryAbi,
      functionName: "getParent",
    });
    const label = parent[1];
    if (!label) {
      return registry.toLowerCase() === sepoliaEns.ethRegistry ? "eth" : "";
    }
    const above = await nameSuffix(client, parent[0], depth + 1);
    return above ? `${label}.${above}` : label;
  } catch {
    return registry.toLowerCase() === sepoliaEns.ethRegistry ? "eth" : "";
  }
}

async function rolesFor(
  client: ReturnType<typeof clientFor>["client"],
  registry: Address,
  id: bigint,
  owner: Address,
): Promise<EnsRole[]> {
  if (owner === zeroAddress) {
    return [];
  }
  const entries = Object.entries(registryRoles) as [
    keyof typeof registryRoles,
    bigint,
  ][];
  const checks = await Promise.all(
    entries.map(async ([role, bitmap]) => {
      const granted = await client.readContract({
        address: registry,
        abi: permissionedRegistryAbi,
        functionName: "hasRoles",
        args: [id, bitmap, owner],
      });
      return { role, granted };
    }),
  );
  return checks;
}

export async function resolveEnsIdentity(
  label: string,
  options: EnsClientOptions = {},
): Promise<EnsIdentity> {
  const normalized = normalizeLabel(label);
  const { client, registry } = clientFor(options);
  if (!normalized) {
    return {
      name: null,
      label,
      namespace: null,
      status: "UNAVAILABLE",
      owner: null,
      tokenId: null,
      expiry: null,
      registry,
      address: null,
      roles: [],
      detail: "Agent name is not a valid ENS label.",
    };
  }

  try {
    const state = await client.readContract({
      address: registry,
      abi: permissionedRegistryAbi,
      functionName: "getState",
      args: [labelId(normalized)],
    });
    const status = nameStatuses[state.status] ?? "UNAVAILABLE";
    const suffix = await nameSuffix(client, registry);
    const registered = status === "REGISTERED";
    const fullName = suffix ? `${normalized}.${suffix}` : null;
    const resolved = fullName
      ? await resolveNameWithSdk(
          fullName,
          options.rpcUrl ?? sepoliaEns.defaultRpcUrl,
        ).catch(() => null)
      : null;
    const registryOwner =
      state.latestOwner === zeroAddress ? null : state.latestOwner;
    const resolvedOwner =
      status === "AVAILABLE" ? null : (resolved?.owner ?? null);
    const owner = resolvedOwner ?? registryOwner;
    const named = Boolean(resolvedOwner) || registered;
    const roles =
      named && owner
        ? await rolesFor(client, registry, labelId(normalized), owner)
        : [];
    return {
      name: named ? fullName : null,
      label: normalized,
      namespace: suffix || null,
      status,
      owner,
      tokenId: state.tokenId === 0n ? null : state.tokenId.toString(),
      expiry:
        state.expiry === 0n
          ? null
          : new Date(Number(state.expiry) * 1000).toISOString(),
      registry,
      address: named ? (resolved?.address ?? null) : null,
      roles,
      detail: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ENS read failed.";
    return {
      name: null,
      label: normalized,
      namespace: null,
      status: "UNAVAILABLE",
      owner: null,
      tokenId: null,
      expiry: null,
      registry,
      address: null,
      roles: [],
      detail: message.split("\n")[0]?.slice(0, 180) ?? "ENS read failed.",
    };
  }
}

export async function registerEnsSubname(input: {
  label: string;
  owner?: string;
  privateKey: Hex;
  rpcUrl?: string;
  registryAddress?: string;
}): Promise<EnsIdentity> {
  const normalized = normalizeLabel(input.label);
  if (!normalized) {
    throw new Error("Agent name is not a valid ENS label.");
  }
  const account = privateKeyToAccount(input.privateKey);
  const owner = input.owner ?? account.address;
  if (!isAddress(owner)) {
    throw new Error("Owner is not an address.");
  }
  const configured = input.registryAddress ?? sepoliaEns.ethRegistry;
  if (!isAddress(configured)) {
    throw new Error("ENS_REGISTRY_ADDRESS is not an address.");
  }
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(input.rpcUrl ?? sepoliaEns.defaultRpcUrl),
  });
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365);
  const hash = await wallet.writeContract({
    address: configured,
    abi: permissionedRegistryAbi,
    functionName: "register",
    args: [
      normalized,
      owner,
      zeroAddress,
      zeroAddress,
      registrationRoleBitmap,
      expiry,
    ],
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(input.rpcUrl ?? sepoliaEns.defaultRpcUrl),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return resolveEnsIdentity(normalized, {
    rpcUrl: input.rpcUrl,
    registryAddress: configured,
  });
}

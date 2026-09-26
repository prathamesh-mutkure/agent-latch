import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  http,
  isAddress,
  keccak256,
  namehash,
  parseEventLogs,
  stringToHex,
  toBytes,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  allRegistryRoles,
  permissionedRegistryAbi,
  registrationRoleBitmap,
  sepoliaEns,
  userRegistryInitAbi,
  verifiableFactoryAbi,
} from "./config";
import { type EnsIdentity, resolveEnsIdentity } from "./identity";
import {
  ensureOwnedResolver,
  pointResolver,
  writeEthAddress,
  writePolicyRecords,
} from "./resolver";

/** Labels of a parent name below `.eth`, nearest first. */
function parentLabelsOf(parentName: string): string[] {
  const normalized = parentName.trim().toLowerCase();
  if (!normalized.endsWith(".eth")) {
    throw new Error("ENS parent name must end in .eth.");
  }
  const labels = normalized.slice(0, -".eth".length).split(".");
  if (labels.some((label) => !/^[a-z0-9-]+$/.test(label))) {
    throw new Error("ENS parent name has an invalid label.");
  }
  return labels;
}

function parentLabelOf(parentName: string): string {
  const [label] = parentLabelsOf(parentName);
  if (!label) {
    throw new Error("ENS parent name has no label.");
  }
  return label;
}

function publicClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

async function subregistryOf(
  rpcUrl: string,
  parentRegistry: Address,
  parentLabel: string,
): Promise<Address> {
  return publicClient(rpcUrl).readContract({
    address: parentRegistry,
    abi: permissionedRegistryAbi,
    functionName: "getSubregistry",
    args: [parentLabel],
  });
}

/**
 * Walks down from the root registry to the registry that holds the parent's
 * own label. For `alice.agent-latch.eth` that is the subregistry of
 * `agent-latch.eth`. Returns the zero address when a level is missing.
 */
async function registryHolding(
  rpcUrl: string,
  root: Address,
  parentName: string,
): Promise<Address> {
  const above = parentLabelsOf(parentName).slice(1).reverse();
  let registry = root;
  for (const label of above) {
    registry = await subregistryOf(rpcUrl, registry, label);
    if (registry === zeroAddress) {
      return zeroAddress;
    }
  }
  return registry;
}

async function deployUserRegistry(input: {
  rpcUrl: string;
  account: ReturnType<typeof privateKeyToAccount>;
  parentName: string;
}): Promise<Address> {
  const wallet = createWalletClient({
    account: input.account,
    chain: sepolia,
    transport: http(input.rpcUrl),
  });
  const client = publicClient(input.rpcUrl);
  const salt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [
          keccak256(stringToHex("UserRegistry")),
          namehash(input.parentName),
          0n,
        ],
      ),
    ),
  );
  const initData = encodeFunctionData({
    abi: userRegistryInitAbi,
    functionName: "initialize",
    args: [[{ account: input.account.address, roleBitmap: allRegistryRoles }]],
  });
  const hash = await wallet.writeContract({
    address: sepoliaEns.verifiableFactory,
    abi: verifiableFactoryAbi,
    functionName: "deployProxy",
    args: [sepoliaEns.userRegistryImpl, salt, initData],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: "ProxyDeployed",
    logs: receipt.logs,
  });
  if (!log) {
    throw new Error("UserRegistry deployment did not emit ProxyDeployed.");
  }
  return log.args.proxyAddress;
}

async function linkSubregistry(input: {
  rpcUrl: string;
  account: ReturnType<typeof privateKeyToAccount>;
  parentRegistry: Address;
  parentLabel: string;
  subregistry: Address;
}) {
  const wallet = createWalletClient({
    account: input.account,
    chain: sepolia,
    transport: http(input.rpcUrl),
  });
  const client = publicClient(input.rpcUrl);
  const labelId = BigInt(keccak256(toBytes(input.parentLabel)));
  const setHash = await wallet.writeContract({
    address: input.parentRegistry,
    abi: permissionedRegistryAbi,
    functionName: "setSubregistry",
    args: [labelId, input.subregistry],
  });
  await client.waitForTransactionReceipt({ hash: setHash });
  const parentHash = await wallet.writeContract({
    address: input.subregistry,
    abi: permissionedRegistryAbi,
    functionName: "setParent",
    args: [input.parentRegistry, input.parentLabel],
  });
  await client.waitForTransactionReceipt({ hash: parentHash });
}

export async function registerUnderParent(input: {
  parentName: string;
  label: string;
  privateKey: Hex;
  owner?: string;
  /** ETH address record. Defaults to the registering key. */
  address?: string;
  rpcUrl?: string;
  /** Root registry. The parent name may sit several levels below it. */
  parentRegistry?: string;
  records?: { key: string; value: string }[];
}): Promise<EnsIdentity> {
  const rpcUrl = input.rpcUrl ?? sepoliaEns.defaultRpcUrl;
  const root = input.parentRegistry ?? sepoliaEns.ethRegistry;
  if (!isAddress(root)) {
    throw new Error("ENS parent registry is not an address.");
  }
  const account = privateKeyToAccount(input.privateKey);
  const owner = input.owner ?? account.address;
  if (!isAddress(owner)) {
    throw new Error("Owner is not an address.");
  }
  const address = input.address ?? account.address;
  if (!isAddress(address)) {
    throw new Error("ETH address record is not an address.");
  }
  const parentLabel = parentLabelOf(input.parentName);
  const parentRegistry = await registryHolding(rpcUrl, root, input.parentName);
  if (parentRegistry === zeroAddress) {
    throw new Error(`Register the parent of ${input.parentName} first.`);
  }
  let subregistry = await subregistryOf(rpcUrl, parentRegistry, parentLabel);
  if (subregistry === zeroAddress) {
    subregistry = await deployUserRegistry({
      rpcUrl,
      account,
      parentName: input.parentName.trim().toLowerCase(),
    });
    await linkSubregistry({
      rpcUrl,
      account,
      parentRegistry,
      parentLabel,
      subregistry,
    });
  }
  const label = input.label.trim().toLowerCase();
  const resolver = await ensureOwnedResolver({ rpcUrl, account });
  const current = await resolveEnsIdentity(label, {
    rpcUrl,
    registryAddress: subregistry,
  });
  if (current.status !== "REGISTERED") {
    const wallet = createWalletClient({
      account,
      chain: sepolia,
      transport: http(rpcUrl),
    });
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365);
    const hash = await wallet.writeContract({
      address: subregistry,
      abi: permissionedRegistryAbi,
      functionName: "register",
      args: [
        label,
        owner,
        zeroAddress,
        resolver,
        registrationRoleBitmap,
        expiry,
      ],
    });
    await publicClient(rpcUrl).waitForTransactionReceipt({ hash });
  }
  await pointResolver({
    rpcUrl,
    account,
    registry: subregistry,
    label,
    resolver,
  });
  const named = await resolveEnsIdentity(label, {
    rpcUrl,
    registryAddress: subregistry,
  });
  if (!named.name) {
    throw new Error("ENS name did not resolve after registration.");
  }
  if (named.address?.toLowerCase() !== address.toLowerCase()) {
    await writeEthAddress({
      rpcUrl,
      account,
      resolver,
      name: named.name,
      address,
    });
  }
  if (input.records && input.records.length > 0) {
    await writePolicyRecords({
      rpcUrl,
      account,
      resolver,
      name: named.name,
      records: input.records,
    });
  }
  return resolveEnsIdentity(label, {
    rpcUrl,
    registryAddress: subregistry,
  });
}

export async function readUnderParent(
  label: string,
  parentName: string,
  rpcUrl: string = sepoliaEns.defaultRpcUrl,
  parentRegistry: string = sepoliaEns.ethRegistry,
): Promise<EnsIdentity> {
  if (!isAddress(parentRegistry)) {
    throw new Error("ENS parent registry is not an address.");
  }
  const parentLabel = parentLabelOf(parentName);
  let subregistry: Address;
  try {
    const holding = await registryHolding(rpcUrl, parentRegistry, parentName);
    subregistry =
      holding === zeroAddress
        ? zeroAddress
        : await subregistryOf(rpcUrl, holding, parentLabel);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ENS read failed.";
    return {
      name: null,
      label: label.trim().toLowerCase(),
      namespace: parentName.trim().toLowerCase(),
      status: "UNAVAILABLE",
      owner: null,
      tokenId: null,
      expiry: null,
      registry: parentRegistry,
      address: null,
      roles: [],
      detail: message.split("\n")[0]?.slice(0, 180) ?? "ENS read failed.",
    };
  }
  if (subregistry === zeroAddress) {
    return {
      name: null,
      label: label.trim().toLowerCase(),
      namespace: parentName.trim().toLowerCase(),
      status: "AVAILABLE",
      owner: null,
      tokenId: null,
      expiry: null,
      registry: parentRegistry,
      address: null,
      roles: [],
      detail: `${parentName} has no subregistry yet.`,
    };
  }
  return resolveEnsIdentity(label, { rpcUrl, registryAddress: subregistry });
}

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

function parentLabelOf(parentName: string): string {
  const normalized = parentName.trim().toLowerCase();
  if (!normalized.endsWith(".eth")) {
    throw new Error("ENS parent name must end in .eth.");
  }
  const label = normalized.slice(0, -".eth".length);
  if (!/^[a-z0-9-]+$/.test(label) || label.includes(".")) {
    throw new Error("ENS parent must be a single .eth label for now.");
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
  rpcUrl?: string;
  parentRegistry?: string;
}): Promise<EnsIdentity> {
  const rpcUrl = input.rpcUrl ?? sepoliaEns.defaultRpcUrl;
  const parentRegistry = input.parentRegistry ?? sepoliaEns.ethRegistry;
  if (!isAddress(parentRegistry)) {
    throw new Error("ENS parent registry is not an address.");
  }
  const account = privateKeyToAccount(input.privateKey);
  const owner = input.owner ?? account.address;
  if (!isAddress(owner)) {
    throw new Error("Owner is not an address.");
  }
  const parentLabel = parentLabelOf(input.parentName);
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
      input.label.trim().toLowerCase(),
      owner,
      zeroAddress,
      zeroAddress,
      registrationRoleBitmap,
      expiry,
    ],
  });
  await publicClient(rpcUrl).waitForTransactionReceipt({ hash });
  return resolveEnsIdentity(input.label, {
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
    subregistry = await subregistryOf(rpcUrl, parentRegistry, parentLabel);
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

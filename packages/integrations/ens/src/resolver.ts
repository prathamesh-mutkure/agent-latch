import {
  type Address,
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getCreate2Address,
  http,
  keccak256,
  parseEventLogs,
  stringToHex,
  toBytes,
  toHex,
} from "viem";
import type { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";
import {
  allRegistryRoles,
  permissionedRegistryAbi,
  sepoliaEns,
  verifiableFactoryAbi,
  zeroAddress,
} from "./config";

const resolverInitAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "grants",
        type: "tuple[]",
        components: [
          { name: "account", type: "address" },
          { name: "roleBitmap", type: "uint256" },
        ],
      },
      { name: "calls", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

const setAddressAbi = [
  {
    type: "function",
    name: "setAddress",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "coinType", type: "uint256" },
      { name: "addressBytes", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const ETH_COIN_TYPE = 60n;

type Account = ReturnType<typeof privateKeyToAccount>;

function clientFor(rpcUrl: string) {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

function walletFor(account: Account, rpcUrl: string) {
  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

function labelId(label: string): bigint {
  return BigInt(keccak256(toBytes(label)));
}

/** One Permissioned Resolver per signer, salt from the ENSv2 factory docs. */
function resolverSalt(owner: Address): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), owner, 0n],
      ),
    ),
  );
}

function predictProxy(input: {
  factory: Address;
  proxyLogic: Address;
  deployer: Address;
  salt: bigint;
}): Address {
  const outerSalt = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [input.deployer, input.salt],
    ),
  );
  const initCode = concat([
    "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
    input.proxyLogic,
    "0x5af43d82803e903d91602b57fd5bf3",
    outerSalt,
  ]);
  return getCreate2Address({
    from: input.factory,
    salt: outerSalt,
    bytecodeHash: keccak256(initCode),
  });
}

export async function ensureOwnedResolver(input: {
  rpcUrl: string;
  account: Account;
}): Promise<Address> {
  const client = clientFor(input.rpcUrl);
  const factory = sepoliaEns.verifiableFactory;
  const salt = resolverSalt(input.account.address);
  const proxyLogic = await client.readContract({
    address: factory,
    abi: verifiableFactoryAbi,
    functionName: "proxyLogic",
  });
  const predicted = predictProxy({
    factory,
    proxyLogic,
    deployer: input.account.address,
    salt,
  });
  const existing = await client.getBytecode({ address: predicted });
  if (existing && existing !== "0x") {
    return predicted;
  }

  const initData = encodeFunctionData({
    abi: resolverInitAbi,
    functionName: "initialize",
    args: [
      [{ account: input.account.address, roleBitmap: allRegistryRoles }],
      [],
    ],
  });
  const hash = await walletFor(input.account, input.rpcUrl).writeContract({
    address: factory,
    abi: verifiableFactoryAbi,
    functionName: "deployProxy",
    args: [sepoliaEns.permissionedResolverImpl, salt, initData],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({
    abi: verifiableFactoryAbi,
    eventName: "ProxyDeployed",
    logs: receipt.logs,
  });
  if (!log) {
    throw new Error("Resolver deployment did not emit ProxyDeployed.");
  }
  return log.args.proxyAddress;
}

export async function resolverOf(input: {
  rpcUrl: string;
  registry: Address;
  label: string;
}): Promise<Address> {
  return clientFor(input.rpcUrl).readContract({
    address: input.registry,
    abi: permissionedRegistryAbi,
    functionName: "getResolver",
    args: [input.label],
  });
}

export async function pointResolver(input: {
  rpcUrl: string;
  account: Account;
  registry: Address;
  label: string;
  resolver: Address;
}): Promise<void> {
  const current = await resolverOf(input);
  if (current.toLowerCase() === input.resolver.toLowerCase()) {
    return;
  }
  const client = clientFor(input.rpcUrl);
  const hash = await walletFor(input.account, input.rpcUrl).writeContract({
    address: input.registry,
    abi: permissionedRegistryAbi,
    functionName: "setResolver",
    args: [labelId(input.label), input.resolver],
  });
  await client.waitForTransactionReceipt({ hash });
}

export async function writeEthAddress(input: {
  rpcUrl: string;
  account: Account;
  resolver: Address;
  name: string;
  address: Address;
}): Promise<void> {
  if (input.resolver === zeroAddress) {
    throw new Error("ENS name has no resolver.");
  }
  const client = clientFor(input.rpcUrl);
  const hash = await walletFor(input.account, input.rpcUrl).writeContract({
    address: input.resolver,
    abi: setAddressAbi,
    functionName: "setAddress",
    args: [toHex(packetToBytes(input.name)), ETH_COIN_TYPE, input.address],
  });
  await client.waitForTransactionReceipt({ hash });
}

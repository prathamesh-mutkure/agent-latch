/**
 * Sepolia ENSv2 beta deployment.
 * Source: https://docs.ens.domains/learn/deployments/
 * Contracts are beta and may change before mainnet. Override ENS_REGISTRY_ADDRESS
 * when the agent namespace is a UserRegistry under a parent name.
 */
export const sepoliaEns = {
  chainId: 11155111,
  ethRegistry: "0x657ea849311d3d5823348dded7c2aaafb3ede09e",
  rootRegistry: "0x9703dbd26dab89504490994138cf2c575251a9ce",
  ethRegistrar: "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca",
  universalResolver: "0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3",
  verifiableFactory: "0x9e726eb570beb6bceb495ab8cda7df517d4e841c",
  userRegistryImpl: "0xa80338aaa8d23831cea25e858d1774534abb0263",
  permissionedResolverImpl: "0x14f09fd05d4585759e54844dc9b00147131cf243",
  defaultRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  defaultParentName: "agent-latch.eth",
} as const;

export const permissionedRegistryAbi = [
  {
    type: "function",
    name: "getState",
    stateMutability: "view",
    inputs: [{ name: "anyId", type: "uint256" }],
    outputs: [
      {
        name: "state",
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "expiry", type: "uint64" },
          { name: "latestOwner", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "resource", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "hasRoles",
    stateMutability: "view",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getParent",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "parent", type: "address" },
      { name: "label", type: "string" },
    ],
  },
  {
    type: "function",
    name: "getSubregistry",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setSubregistry",
    stateMutability: "nonpayable",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "registry", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setParent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parent", type: "address" },
      { name: "label", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "registry", type: "address" },
      { name: "resolver", type: "address" },
      { name: "roleBitmap", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getResolver",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "resolver", type: "address" },
    ],
    outputs: [],
  },
] as const;

/** Permissioned Registry roles. Values are from the ENSv2 registry docs. */
export const registryRoles = {
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_SET_RESOLVER: 1n << 24n,
  ROLE_RENEW: 1n << 16n,
  ROLE_UNREGISTER: 1n << 12n,
  ROLE_CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
} as const;

export const registrationRoleBitmap =
  registryRoles.ROLE_SET_SUBREGISTRY |
  (registryRoles.ROLE_SET_SUBREGISTRY << 128n) |
  registryRoles.ROLE_SET_RESOLVER |
  (registryRoles.ROLE_SET_RESOLVER << 128n) |
  registryRoles.ROLE_CAN_TRANSFER_ADMIN;

export const zeroAddress =
  "0x0000000000000000000000000000000000000000" as const;

/** Every regular role and its admin role. Used to initialize a UserRegistry. */
export const allRegistryRoles =
  0x1111111111111111111111111111111111111111111111111111111111111111n;

export const verifiableFactoryAbi = [
  {
    type: "function",
    name: "proxyLogic",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "deployProxy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "proxy", type: "address" }],
  },
  {
    type: "event",
    name: "ProxyDeployed",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "proxyAddress", type: "address", indexed: true },
      { name: "salt", type: "uint256", indexed: false },
      { name: "implementation", type: "address", indexed: false },
    ],
  },
] as const;

export const userRegistryInitAbi = [
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
    ],
    outputs: [],
  },
] as const;

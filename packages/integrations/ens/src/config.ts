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
  defaultRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
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

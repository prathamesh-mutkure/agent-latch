export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** EIP-712 payload for one already-authorized USDC transfer. */
export type TransferAuthorization = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  message: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: Hex;
  };
};

/**
 * Produces signatures. It does not decide policy and it does not choose an executor.
 * Callers sign only after ALLOW or a still-valid scoped approval.
 */
export type AgentSigner = {
  address: Address;
  signTransferAuthorization(authorization: TransferAuthorization): Promise<Hex>;
  sendTransaction(tx: { to: Address; data: Hex }): Promise<Hex>;
};

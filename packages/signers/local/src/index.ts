import type { AgentSigner, TransferAuthorization } from "@agentlatch/core";
import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const transferTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function localKeySigner(input: {
  privateKey: string;
  rpcUrl: string;
}): AgentSigner {
  if (!isHex(input.privateKey) || input.privateKey.length !== 66) {
    throw new Error("EXECUTOR_PRIVATE_KEY must be a 32-byte hex key.");
  }
  const account = privateKeyToAccount(input.privateKey);
  const transport = http(input.rpcUrl);
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });
  const client = createPublicClient({ chain: sepolia, transport });

  return {
    address: account.address,
    async signTransferAuthorization(authorization: TransferAuthorization) {
      return account.signTypedData({
        domain: authorization.domain,
        types: transferTypes,
        primaryType: "TransferWithAuthorization",
        message: authorization.message,
      });
    },
    async sendTransaction(tx) {
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        account,
        chain: sepolia,
      });
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });
      if (receipt.status !== "success") {
        throw new Error("x402 settlement transaction reverted.");
      }
      return hash;
    },
  };
}

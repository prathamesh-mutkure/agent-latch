import {
  type Address,
  type AgentSigner,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";
import { transferAuthorization } from "@agentlatch/x402";
import { encodeFunctionData, isAddress } from "viem";
import { generatePrivateKey } from "viem/accounts";

const transferWithAuthorizationAbi = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export class X402SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402SettlementError";
  }
}

/**
 * Signs an exact USDC authorization and broadcasts it.
 * The signer is supplied. This module does not read a private key.
 * Public facilitators do not settle outside signatures on Ethereum Sepolia,
 * so the signer also pays gas for the settlement transaction.
 */
export async function settleExactUsdc(input: {
  signer: AgentSigner;
  payTo: string;
  amountBaseUnits: string;
}): Promise<{ txHash: `0x${string}` }> {
  if (!isAddress(input.payTo)) {
    throw new X402SettlementError(
      "x402 settlement needs an Ethereum address payee.",
    );
  }
  const value = BigInt(input.amountBaseUnits);
  if (value <= 0n) {
    throw new X402SettlementError("x402 amount must be greater than zero.");
  }
  const authorization = transferAuthorization({
    from: input.signer.address,
    to: input.payTo,
    value,
    nonce: generatePrivateKey(),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  const signature = await input.signer.signTransferAuthorization(authorization);
  const data = encodeFunctionData({
    abi: transferWithAuthorizationAbi,
    functionName: "transferWithAuthorization",
    args: [
      authorization.message.from,
      authorization.message.to,
      authorization.message.value,
      authorization.message.validAfter,
      authorization.message.validBefore,
      authorization.message.nonce,
      signature,
    ],
  });
  try {
    const txHash = await input.signer.sendTransaction({
      to: USDC_SEPOLIA_ADDRESS as Address,
      data,
    });
    return { txHash };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "x402 settlement failed.";
    throw new X402SettlementError(message);
  }
}

import {
  type Address,
  type AgentSigner,
  type Hex,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";
import { encodeFunctionData } from "viem";

const USDC = USDC_SEPOLIA_ADDRESS as Address;

const transferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Sends Circle USDC from the signer to one address on Ethereum Sepolia.
 * The signer is supplied. This module does not read a private key.
 * The returned hash is a transaction that has already landed.
 */
export async function transferSepoliaUsdc(input: {
  signer: AgentSigner;
  to: Address;
  amount: bigint;
}): Promise<Hex> {
  if (input.amount <= 0n) {
    throw new Error("USDC transfer amount must be greater than zero.");
  }
  const data = encodeFunctionData({
    abi: transferAbi,
    functionName: "transfer",
    args: [input.to, input.amount],
  });
  return input.signer.sendTransaction({ to: USDC, data });
}

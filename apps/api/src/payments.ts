import { USDC_SEPOLIA_ADDRESS } from "@agentlatch/core";
import { localKeySigner } from "@agentlatch/signer-local";
import {
  settleExactUsdc,
  X402SettlementError,
} from "@agentlatch/x402-executor";
import type { Failure, Success } from "./result";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export async function settleAuthorizedPayment(input: {
  target: string;
  token: string;
  amount: string;
}): Promise<Success<{ txHash: string }> | Failure> {
  if (input.token.toLowerCase() !== USDC_SEPOLIA_ADDRESS.toLowerCase()) {
    return {
      ok: false,
      status: 400,
      error: "x402 settlement is Circle USDC on Ethereum Sepolia.",
    };
  }
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY ?? "";
  if (!privateKey.startsWith("0x")) {
    return {
      ok: false,
      status: 400,
      error: "EXECUTOR_PRIVATE_KEY is required to settle an x402 payment.",
    };
  }
  try {
    const signer = localKeySigner({
      privateKey,
      rpcUrl: process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC,
    });
    const settled = await settleExactUsdc({
      signer,
      payTo: input.target,
      amountBaseUnits: input.amount,
    });
    return { ok: true, value: { txHash: settled.txHash } };
  } catch (error) {
    const message =
      error instanceof X402SettlementError
        ? error.message
        : "x402 settlement failed.";
    return { ok: false, status: 400, error: message };
  }
}

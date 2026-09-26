import {
  type ActionType,
  type AgentSigner,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";
import { localKeySigner } from "@agentlatch/signer-local";
import { transferSepoliaUsdc } from "@agentlatch/transfer-executor";
import {
  swapUsdcToWeth,
  UNISWAP_SWAP_OUTPUT,
} from "@agentlatch/uniswap-executor";
import { getAddress, isAddress } from "viem";
import type { Failure, Success } from "./result";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const USDC = USDC_SEPOLIA_ADDRESS.toLowerCase();

export type Broadcast = {
  txHash: string;
  detail: string;
};

/**
 * TOKEN_TRANSFER and SWAP have a fixed shape. A bad target is refused before
 * policy, and again before a broadcast, so an approval cannot settle it either.
 * X402_PAYMENT, API_CALL, and CONTRACT_CALL are not checked here.
 */
export function refuseSettlementTarget(input: {
  action: ActionType;
  target: string;
  token: string;
}): Failure | undefined {
  if (input.action === "TOKEN_TRANSFER") {
    if (input.token.toLowerCase() !== USDC) {
      return {
        ok: false,
        status: 400,
        error: "TOKEN_TRANSFER spends Circle USDC on Ethereum Sepolia.",
      };
    }
    if (!isAddress(input.target)) {
      return {
        ok: false,
        status: 400,
        error: "TOKEN_TRANSFER target must be an Ethereum address.",
      };
    }
  }
  if (input.action === "SWAP") {
    if (input.token.toLowerCase() !== USDC) {
      return {
        ok: false,
        status: 400,
        error: "SWAP spends Circle USDC on Ethereum Sepolia.",
      };
    }
    if (input.target.toLowerCase() === "0xvenue") {
      return {
        ok: false,
        status: 400,
        error: `SWAP target 0xvenue is not supported. The output token is Sepolia WETH ${UNISWAP_SWAP_OUTPUT}.`,
      };
    }
    if (input.target.toLowerCase() !== UNISWAP_SWAP_OUTPUT.toLowerCase()) {
      return {
        ok: false,
        status: 400,
        error: `SWAP only supports USDC to Sepolia WETH ${UNISWAP_SWAP_OUTPUT}.`,
      };
    }
  }
  return undefined;
}

/**
 * Broadcasts one already-authorized USDC transfer or USDC-to-WETH swap.
 * Returns only after the transaction lands. A chain error is the failure
 * message, and the caller must not mark the action executed.
 */
export async function broadcastAuthorizedAction(input: {
  action: "TOKEN_TRANSFER" | "SWAP";
  target: string;
  token: string;
  amount: string;
}): Promise<Success<Broadcast> | Failure> {
  const refused = refuseSettlementTarget(input);
  if (refused) {
    return refused;
  }
  const signer = loadSigner();
  if (!signer.ok) {
    return signer;
  }
  const amount = BigInt(input.amount);
  try {
    if (input.action === "TOKEN_TRANSFER") {
      const txHash = await transferSepoliaUsdc({
        signer: signer.value,
        to: getAddress(input.target),
        amount,
      });
      return {
        ok: true,
        value: { txHash, detail: `usdc transfer ${txHash}` },
      };
    }
    const txHash = await swapUsdcToWeth({
      signer: signer.value,
      amountIn: amount,
      rpcUrl: process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC,
    });
    return {
      ok: true,
      value: { txHash, detail: `uniswap swap ${txHash}` },
    };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: chainMessage(error, "Sepolia transaction failed."),
    };
  }
}

function loadSigner(): Success<AgentSigner> | Failure {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY ?? "";
  if (!privateKey.startsWith("0x")) {
    return {
      ok: false,
      status: 400,
      error:
        "EXECUTOR_PRIVATE_KEY is required to broadcast on Ethereum Sepolia.",
    };
  }
  try {
    return {
      ok: true,
      value: localKeySigner({
        privateKey,
        rpcUrl: process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error:
        error instanceof Error
          ? error.message
          : "Executor signer is not configured.",
    };
  }
}

function chainMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "shortMessage" in error) {
    const short = error.shortMessage;
    if (typeof short === "string" && short.length > 0) {
      return short;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

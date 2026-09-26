import { localKeySigner } from "@agentlatch/signer-local";
import {
  type FacilitatorRequest,
  type SettleResponse,
  type VerifyResponse,
  X402_NETWORK,
} from "@agentlatch/x402";
import { settleExactUsdc, verifyExactUsdc } from "@agentlatch/x402-executor";
import { Elysia } from "elysia";
import { payTo } from "../x402/routes";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

function rpcUrl(): string {
  return process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC;
}

/** The facilitator pays gas only for AgentLatch's own sellers. */
function ownSeller(request: FacilitatorRequest): boolean {
  const target = request?.paymentRequirements?.payTo;
  return (
    typeof target === "string" && target.toLowerCase() === payTo().toLowerCase()
  );
}

function refused(reason: string): SettleResponse {
  return {
    success: false,
    errorReason: reason,
    transaction: "",
    network: X402_NETWORK,
  };
}

/**
 * x402 facilitator for the demo sellers on Ethereum Sepolia. Public
 * facilitators do not settle there. Sellers call it; buyers never do.
 */
export const facilitatorRoutes = new Elysia({ prefix: "/facilitator" })
  .get("/supported", () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: X402_NETWORK }],
  }))
  .post("/verify", async ({ body }): Promise<VerifyResponse> => {
    const request = body as FacilitatorRequest;
    if (!ownSeller(request)) {
      return { isValid: false, invalidReason: "unsupported_payee" };
    }
    try {
      return await verifyExactUsdc({ request, rpcUrl: rpcUrl() });
    } catch {
      return { isValid: false, invalidReason: "rpc_unavailable" };
    }
  })
  .post("/settle", async ({ body }): Promise<SettleResponse> => {
    const request = body as FacilitatorRequest;
    if (!ownSeller(request)) {
      return refused("unsupported_payee");
    }
    const privateKey =
      process.env.FACILITATOR_PRIVATE_KEY ??
      process.env.EXECUTOR_PRIVATE_KEY ??
      "";
    if (!privateKey.startsWith("0x")) {
      return refused("facilitator_key_missing");
    }
    try {
      return await settleExactUsdc({
        request,
        submitter: localKeySigner({ privateKey, rpcUrl: rpcUrl() }),
        rpcUrl: rpcUrl(),
      });
    } catch (error) {
      return refused(
        error instanceof Error ? error.message : "x402 settlement failed.",
      );
    }
  });

import { USDC_SEPOLIA_ADDRESS } from "@agentlatch/core";
import { paymentRequired } from "@agentlatch/x402";
import { Elysia } from "elysia";

const QUOTE_BASE_UNITS = "10000";
const DEMO_PAYEE = "0x142B99367b928608835501633534411EFc467737";
const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

function payTo(): `0x${string}` {
  const configured = process.env.X402_PAY_TO ?? "";
  if (/^0x[0-9a-fA-F]{40}$/.test(configured)) {
    return configured as `0x${string}`;
  }
  return DEMO_PAYEE;
}

async function settledUsdcTransfer(txHash: string): Promise<boolean> {
  const response = await fetch(process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  });
  const body = (await response.json()) as {
    result?: { status?: string; to?: string } | null;
  };
  const receipt = body.result;
  return (
    receipt?.status === "0x1" &&
    receipt.to?.toLowerCase() === USDC_SEPOLIA_ADDRESS.toLowerCase()
  );
}

export const x402Routes = new Elysia().get(
  "/x402/resource",
  async ({ request, set }) => {
    const txHash = new URL(request.url).searchParams.get("tx") ?? "";
    if (
      /^0x[0-9a-fA-F]{64}$/.test(txHash) &&
      (await settledUsdcTransfer(txHash))
    ) {
      return {
        paid: true,
        txHash,
        description: "Paid resource on Ethereum Sepolia.",
      };
    }
    set.status = 402;
    return paymentRequired({
      resource: new URL(request.url).toString(),
      payTo: payTo(),
      amountBaseUnits: QUOTE_BASE_UNITS,
      description: "AgentLatch paid resource. 0.01 USDC on Ethereum Sepolia.",
    });
  },
);

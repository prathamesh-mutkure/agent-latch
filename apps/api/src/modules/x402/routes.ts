import {
  decodeHeader,
  encodeHeader,
  type FacilitatorRequest,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type PaymentPayload,
  type PaymentRequired,
  paymentRequired,
  type SettleResponse,
  type VerifyResponse,
  X402_NETWORK,
} from "@agentlatch/x402";
import { Elysia } from "elysia";

const QUOTE_BASE_UNITS = "10000";
const DEMO_PAYEE = "0x142B99367b928608835501633534411EFc467737";

/** Payee for the demo seller. The facilitator settles only to this address. */
export function payTo(): `0x${string}` {
  const configured = process.env.X402_PAY_TO ?? "";
  if (/^0x[0-9a-fA-F]{40}$/.test(configured)) {
    return configured as `0x${string}`;
  }
  return DEMO_PAYEE;
}

function facilitatorUrl(): string {
  return (
    process.env.FACILITATOR_URL ??
    `http://localhost:${process.env.PORT ?? 3001}/facilitator`
  );
}

async function callFacilitator<T>(
  path: "verify" | "settle",
  body: FacilitatorRequest,
): Promise<T | undefined> {
  try {
    const response = await fetch(`${facilitatorUrl()}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function quote(url: string): PaymentRequired {
  return paymentRequired({
    resource: url,
    payTo: payTo(),
    amountBaseUnits: QUOTE_BASE_UNITS,
    description: "AgentLatch paid resource. 0.01 USDC on Ethereum Sepolia.",
  });
}

/**
 * Demo seller. Without a PAYMENT-SIGNATURE header it quotes 402. With one, it
 * asks the facilitator to verify and settle, and serves the resource only after
 * the settlement lands.
 */
export const x402Routes = new Elysia().get(
  "/x402/resource",
  async ({ request, set }) => {
    const required = quote(new URL(request.url).toString());
    const requirement = required.accepts[0];
    const refuse = (error: string) => {
      set.status = 402;
      set.headers[PAYMENT_REQUIRED_HEADER] = encodeHeader({
        ...required,
        error,
      });
      return { ...required, error };
    };

    const header = request.headers.get(PAYMENT_SIGNATURE_HEADER);
    if (!header) {
      return refuse(required.error);
    }
    const paymentPayload = decodeHeader(header) as PaymentPayload | undefined;
    if (!paymentPayload || typeof paymentPayload !== "object") {
      return refuse("invalid_payload");
    }
    const body: FacilitatorRequest = {
      x402Version: 2,
      paymentPayload,
      paymentRequirements: requirement,
    };

    const verified = await callFacilitator<VerifyResponse>("verify", body);
    if (!verified?.isValid) {
      return refuse(verified?.invalidReason ?? "facilitator_unavailable");
    }
    const settled = await callFacilitator<SettleResponse>("settle", body);
    if (!settled?.success || !settled.transaction) {
      return refuse(settled?.errorReason ?? "facilitator_unavailable");
    }
    set.headers[PAYMENT_RESPONSE_HEADER] = encodeHeader({
      ...settled,
      network: X402_NETWORK,
    });
    return {
      paid: true,
      txHash: settled.transaction,
      description: "Paid resource on Ethereum Sepolia.",
    };
  },
);

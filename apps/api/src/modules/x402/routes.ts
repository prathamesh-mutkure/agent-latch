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
import { catalog } from "./merchants";

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

const DESCRIPTION = "AgentLatch paid resource. 0.01 USDC on Ethereum Sepolia.";

function quote(
  url: string,
  amountBaseUnits = QUOTE_BASE_UNITS,
  description = DESCRIPTION,
): PaymentRequired {
  return paymentRequired({
    resource: url,
    payTo: payTo(),
    amountBaseUnits,
    description,
  });
}

/** One entry in AgentLatch's own seller registry. */
export type Merchant = {
  id: string;
  name: string;
  description: string;
  url: string;
  scheme: "exact";
  network: typeof X402_NETWORK;
  asset: string;
  payTo: string;
  amountBaseUnits: string;
  facilitator: string;
};

function merchant(
  origin: string,
  entry: { id: string; name: string; description: string; path: string },
  amountBaseUnits: string,
): Merchant {
  const url = `${origin}${entry.path}`;
  const requirement = quote(url, amountBaseUnits, entry.description).accepts[0];
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    url,
    scheme: requirement.scheme,
    network: X402_NETWORK,
    asset: requirement.asset,
    payTo: requirement.payTo,
    amountBaseUnits: requirement.amount,
    facilitator: facilitatorUrl(),
  };
}

/**
 * Without a PAYMENT-SIGNATURE header, quotes 402. With one, asks the
 * facilitator to verify and settle, and serves only after the settlement lands.
 */
async function sell(
  request: Request,
  set: { status?: number | string; headers: Record<string, unknown> },
  amountBaseUnits: string,
  description: string,
  serve: () => unknown,
) {
  const required = quote(
    new URL(request.url).toString(),
    amountBaseUnits,
    description,
  );
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
  // The money has moved. A failed item still returns the receipt.
  try {
    return { paid: true, txHash: settled.transaction, item: await serve() };
  } catch (error) {
    return {
      paid: true,
      txHash: settled.transaction,
      item: null,
      error: error instanceof Error ? error.message : "Item failed.",
    };
  }
}

/** The 0.01 USDC demo seller, then the catalog in `merchants.ts`. */
export const x402Routes = new Elysia()
  .get("/x402/merchants", ({ request }): Merchant[] => {
    const origin = new URL(request.url).origin;
    return [
      merchant(
        origin,
        {
          id: "agentlatch-demo",
          name: "AgentLatch demo seller",
          description: DESCRIPTION,
          path: "/x402/resource",
        },
        QUOTE_BASE_UNITS,
      ),
      ...catalog.map((entry) =>
        merchant(
          origin,
          {
            id: entry.id,
            name: `${entry.emoji} ${entry.name}`,
            description: entry.description,
            path: `/x402/shop/${entry.id}`,
          },
          entry.amountBaseUnits,
        ),
      ),
    ];
  })
  .get("/x402/resource", ({ request, set }) =>
    sell(request, set, QUOTE_BASE_UNITS, DESCRIPTION, () => ({
      description: "Paid resource on Ethereum Sepolia.",
    })),
  )
  .get("/x402/shop/:merchantId", ({ params, request, set }) => {
    const entry = catalog.find((item) => item.id === params.merchantId);
    if (!entry) {
      set.status = 404;
      return { error: "No such merchant." };
    }
    return sell(
      request,
      set,
      entry.amountBaseUnits,
      `${entry.name}: ${entry.description}`,
      entry.serve,
    );
  });

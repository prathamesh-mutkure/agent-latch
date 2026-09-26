import { USDC_SEPOLIA_ADDRESS } from "@agentlatch/core";
import {
  InterceptaError,
  type PaymentScreen,
  screenPayment,
} from "@agentlatch/intercepta";
import { localKeySigner } from "@agentlatch/signer-local";
import {
  decodeHeader,
  encodeHeader,
  isSupportedRequirement,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type PaymentRequired,
  type PaymentRequirements,
  type PaymentResource,
  type SettleResponse,
} from "@agentlatch/x402";
import { signExactUsdc, X402SettlementError } from "@agentlatch/x402-executor";
import type { Failure, Success } from "./result";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

/** What a seller asks for one resource, already checked against the action. */
export type Quote = {
  url: string;
  resource: PaymentResource;
  requirement: PaymentRequirements;
};

/**
 * Asks the resource for its price. The action's target is the resource URL.
 * The quote must be exact Sepolia USDC for exactly the action's amount.
 */
export async function quoteResource(input: {
  target: string;
  token: string;
  amount: string;
}): Promise<Success<Quote> | Failure> {
  if (input.token.toLowerCase() !== USDC_SEPOLIA_ADDRESS.toLowerCase()) {
    return {
      ok: false,
      status: 400,
      error: "x402 settlement is Circle USDC on Ethereum Sepolia.",
    };
  }
  let url: URL;
  try {
    url = new URL(input.target);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "x402 payment target must be the resource URL.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      status: 400,
      error: "x402 payment target must be an http or https URL.",
    };
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return { ok: false, status: 400, error: "x402 resource did not answer." };
  }
  if (response.status !== 402) {
    return {
      ok: false,
      status: 400,
      error: `x402 resource answered ${response.status}, not 402.`,
    };
  }
  const header = response.headers.get(PAYMENT_REQUIRED_HEADER);
  const required = (
    header ? decodeHeader(header) : await response.json().catch(() => undefined)
  ) as PaymentRequired | undefined;
  const requirement = required?.accepts?.find(isSupportedRequirement);
  if (!required || !requirement) {
    return {
      ok: false,
      status: 400,
      error: "x402 resource does not accept exact USDC on Ethereum Sepolia.",
    };
  }
  if (requirement.amount !== input.amount) {
    return {
      ok: false,
      status: 400,
      error: `x402 resource asks ${requirement.amount} base units, not ${input.amount}.`,
    };
  }
  return {
    ok: true,
    value: {
      url: url.toString(),
      resource: required.resource ?? {
        url: url.toString(),
        description: "",
        mimeType: "application/json",
      },
      requirement,
    },
  };
}

/** Intercepta quick scan of the quote's payee. */
export async function screenPayee(
  payTo: string,
): Promise<Success<PaymentScreen> | Failure> {
  try {
    return {
      ok: true,
      value: await screenPayment({
        payTo,
        apiKey: process.env.INTERCEPTA_API_KEY ?? "",
      }),
    };
  } catch (error) {
    const message =
      error instanceof InterceptaError
        ? error.message
        : "Intercepta screening failed.";
    return { ok: false, status: 400, error: message };
  }
}

/**
 * Signs the quote and retries the resource with PAYMENT-SIGNATURE. The
 * seller's facilitator settles. Returns the settlement transaction.
 */
export async function payQuote(
  quote: Quote,
): Promise<Success<{ txHash: string }> | Failure> {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY ?? "";
  if (!privateKey.startsWith("0x")) {
    return {
      ok: false,
      status: 400,
      error: "EXECUTOR_PRIVATE_KEY is required to sign an x402 payment.",
    };
  }
  try {
    const signer = localKeySigner({
      privateKey,
      rpcUrl: process.env.SEPOLIA_RPC_URL ?? DEFAULT_RPC,
    });
    const payload = await signExactUsdc({
      signer,
      resource: quote.resource,
      requirement: quote.requirement,
    });
    const response = await fetch(quote.url, {
      headers: { [PAYMENT_SIGNATURE_HEADER]: encodeHeader(payload) },
      signal: AbortSignal.timeout(90_000),
    });
    const header = response.headers.get(PAYMENT_RESPONSE_HEADER);
    const settled = header
      ? (decodeHeader(header) as SettleResponse | undefined)
      : undefined;
    if (!response.ok || !settled?.success || !settled.transaction) {
      const refusal = response.headers.get(PAYMENT_REQUIRED_HEADER);
      const reason = refusal
        ? (decodeHeader(refusal) as { error?: string } | undefined)?.error
        : undefined;
      return {
        ok: false,
        status: 400,
        error: `x402 seller refused the payment: ${reason ?? response.status}.`,
      };
    }
    return { ok: true, value: { txHash: settled.transaction } };
  } catch (error) {
    const message =
      error instanceof X402SettlementError
        ? error.message
        : "x402 payment failed.";
    return { ok: false, status: 400, error: message };
  }
}

/**
 * Pays an approved action: quote again, screen the payee again, then pay.
 * The seller may have changed its payee since the action was submitted.
 */
export async function settleAuthorizedPayment(input: {
  target: string;
  token: string;
  amount: string;
}): Promise<Success<{ txHash: string }> | Failure> {
  const quote = await quoteResource(input);
  if (!quote.ok) {
    return quote;
  }
  const screened = await screenPayee(quote.value.requirement.payTo);
  if (!screened.ok) {
    return screened;
  }
  if (screened.value.blocked) {
    return { ok: false, status: 400, error: screened.value.detail };
  }
  return payQuote(quote.value);
}

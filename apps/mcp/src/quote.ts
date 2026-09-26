import { formatUsdc } from "@agentlatch/core";
import {
  decodeHeader,
  isSupportedRequirement,
  PAYMENT_REQUIRED_HEADER,
  type PaymentRequired,
  type PaymentRequirements,
} from "@agentlatch/x402";

export type Quote = {
  url: string;
  description: string;
  priceUsdc: string;
  requirement: PaymentRequirements;
};

/**
 * Reads a resource's x402 price without paying. Only exact Circle USDC on
 * Ethereum Sepolia can be paid through AgentLatch.
 */
export async function quote(url: string): Promise<Quote> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("x402 resource must be an http or https URL.");
  }
  let response: Response;
  try {
    response = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("x402 resource did not answer.");
  }
  if (response.status !== 402) {
    throw new Error(`x402 resource answered ${response.status}, not 402.`);
  }
  const header = response.headers.get(PAYMENT_REQUIRED_HEADER);
  const required = (
    header ? decodeHeader(header) : await response.json().catch(() => undefined)
  ) as PaymentRequired | undefined;
  const requirement = required?.accepts?.find(isSupportedRequirement);
  if (!required || !requirement) {
    throw new Error(
      "x402 resource does not accept exact USDC on Ethereum Sepolia.",
    );
  }
  return {
    url: parsed.toString(),
    description: required.resource?.description ?? "",
    priceUsdc: formatUsdc(requirement.amount),
    requirement,
  };
}

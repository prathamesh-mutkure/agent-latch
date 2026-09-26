import {
  type Address,
  type Hex,
  SEPOLIA_CHAIN_ID,
  type TransferAuthorization,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";

export const X402_NETWORK = "eip155:11155111";
export const USDC_EIP712_NAME = "USDC";
export const USDC_EIP712_VERSION = "2";
export const PAYMENT_TTL_SECONDS = 15 * 60;

export type ExactPayment = {
  payTo: Address;
  amountBaseUnits: string;
  asset: Address;
  network: typeof X402_NETWORK;
  resource: string;
};

/** x402 v2 header names. */
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

export type PaymentRequirements = {
  scheme: "exact";
  network: typeof X402_NETWORK;
  amount: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

export type PaymentResource = {
  url: string;
  description: string;
  mimeType: "application/json";
};

export type PaymentRequired = {
  x402Version: 2;
  error: "PAYMENT-REQUIRED";
  resource: PaymentResource;
  accepts: [PaymentRequirements];
};

/** EIP-3009 authorization as it travels in JSON. Integers are decimal strings. */
export type ExactAuthorization = {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
};

/** Sent by the buyer in the PAYMENT-SIGNATURE header. */
export type PaymentPayload = {
  x402Version: 2;
  resource: PaymentResource;
  accepted: PaymentRequirements;
  payload: { signature: Hex; authorization: ExactAuthorization };
};

/** Body of POST /facilitator/verify and POST /facilitator/settle. */
export type FacilitatorRequest = {
  x402Version: 2;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  payer?: Address;
};

/** Returned by the facilitator, and by the seller in the PAYMENT-RESPONSE header. */
export type SettleResponse = {
  success: boolean;
  errorReason?: string;
  payer?: Address;
  transaction: Hex | "";
  network: typeof X402_NETWORK;
};

/** Base64 of the JSON, the encoding every x402 header uses. */
export function encodeHeader(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decodes an x402 header. Returns undefined when it is not base64 JSON. */
export function decodeHeader(value: string): unknown {
  try {
    const binary = atob(value.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** The one requirement AgentLatch can pay: exact Circle USDC on Ethereum Sepolia. */
export function isSupportedRequirement(
  value: unknown,
): value is PaymentRequirements {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const requirement = value as Partial<PaymentRequirements>;
  return (
    requirement.scheme === "exact" &&
    requirement.network === X402_NETWORK &&
    typeof requirement.asset === "string" &&
    requirement.asset.toLowerCase() === USDC_SEPOLIA_ADDRESS.toLowerCase() &&
    typeof requirement.payTo === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(requirement.payTo) &&
    typeof requirement.amount === "string" &&
    /^\d+$/.test(requirement.amount) &&
    typeof requirement.maxTimeoutSeconds === "number"
  );
}

export function paymentRequired(input: {
  resource: string;
  payTo: Address;
  amountBaseUnits: string;
  description: string;
}): PaymentRequired {
  return {
    x402Version: 2,
    error: "PAYMENT-REQUIRED",
    resource: {
      url: input.resource,
      description: input.description,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: X402_NETWORK,
        amount: input.amountBaseUnits,
        asset: USDC_SEPOLIA_ADDRESS,
        payTo: input.payTo,
        maxTimeoutSeconds: PAYMENT_TTL_SECONDS,
        extra: { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION },
      },
    ],
  };
}

export function transferAuthorization(input: {
  from: Address;
  to: Address;
  value: bigint;
  nonce: Hex;
  nowSeconds: number;
  ttlSeconds?: number;
}): TransferAuthorization {
  return {
    domain: {
      name: USDC_EIP712_NAME,
      version: USDC_EIP712_VERSION,
      chainId: SEPOLIA_CHAIN_ID,
      verifyingContract: USDC_SEPOLIA_ADDRESS,
    },
    message: {
      from: input.from,
      to: input.to,
      value: input.value,
      validAfter: 0n,
      validBefore: BigInt(
        input.nowSeconds + (input.ttlSeconds ?? PAYMENT_TTL_SECONDS),
      ),
      nonce: input.nonce,
    },
  };
}

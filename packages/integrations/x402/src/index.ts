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

export type PaymentRequired = {
  x402Version: 2;
  error: "PAYMENT-REQUIRED";
  resource: {
    url: string;
    description: string;
    mimeType: "application/json";
  };
  accepts: [
    {
      scheme: "exact";
      network: typeof X402_NETWORK;
      amount: string;
      asset: Address;
      payTo: Address;
      maxTimeoutSeconds: number;
      extra: { name: string; version: string };
    },
  ];
};

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
      validBefore: BigInt(input.nowSeconds + PAYMENT_TTL_SECONDS),
      nonce: input.nonce,
    },
  };
}

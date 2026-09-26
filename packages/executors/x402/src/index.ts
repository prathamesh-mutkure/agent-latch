import {
  type Address,
  type AgentSigner,
  type Hex,
  SEPOLIA_CHAIN_ID,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";
import {
  type FacilitatorRequest,
  isSupportedRequirement,
  type PaymentPayload,
  type PaymentRequirements,
  type PaymentResource,
  type SettleResponse,
  transferAuthorization,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
  type VerifyResponse,
  X402_NETWORK,
} from "@agentlatch/x402";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddressEqual,
  recoverTypedDataAddress,
} from "viem";
import { generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";

const transferWithAuthorizationAbi = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const usdcReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const transferTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Leaves time for the settlement transaction to land before the authorization lapses. */
const SETTLE_MARGIN_SECONDS = 6;

export class X402SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402SettlementError";
  }
}

/**
 * Buyer side. Signs an exact USDC authorization for one quote and returns the
 * PAYMENT-SIGNATURE payload. Nothing is broadcast: the seller's facilitator settles.
 * The signer is supplied. This module does not read a private key.
 */
export async function signExactUsdc(input: {
  signer: AgentSigner;
  resource: PaymentResource;
  requirement: PaymentRequirements;
}): Promise<PaymentPayload> {
  if (!isSupportedRequirement(input.requirement)) {
    throw new X402SettlementError(
      "x402 quote is not exact Circle USDC on Ethereum Sepolia.",
    );
  }
  const value = BigInt(input.requirement.amount);
  if (value <= 0n) {
    throw new X402SettlementError("x402 amount must be greater than zero.");
  }
  const authorization = transferAuthorization({
    from: input.signer.address,
    to: input.requirement.payTo,
    value,
    nonce: generatePrivateKey(),
    nowSeconds: Math.floor(Date.now() / 1000),
    ttlSeconds: input.requirement.maxTimeoutSeconds,
  });
  const signature = await input.signer.signTransferAuthorization(authorization);
  const message = authorization.message;
  return {
    x402Version: 2,
    resource: input.resource,
    accepted: input.requirement,
    payload: {
      signature,
      authorization: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        nonce: message.nonce,
      },
    },
  };
}

/**
 * Facilitator side. Checks that the payload pays exactly these requirements,
 * that the signature is the payer's, and that the chain will accept it.
 */
export async function verifyExactUsdc(input: {
  request: FacilitatorRequest;
  rpcUrl: string;
}): Promise<VerifyResponse> {
  const { paymentPayload, paymentRequirements } = input.request;
  const authorization = paymentPayload?.payload?.authorization;
  const signature = paymentPayload?.payload?.signature;
  if (
    paymentPayload?.x402Version !== 2 ||
    !authorization ||
    typeof signature !== "string"
  ) {
    return { isValid: false, invalidReason: "invalid_payload" };
  }
  if (!isSupportedRequirement(paymentRequirements)) {
    return { isValid: false, invalidReason: "unsupported_scheme" };
  }
  const payer = authorization.from;

  let value: bigint;
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    value = BigInt(authorization.value);
    validAfter = BigInt(authorization.validAfter);
    validBefore = BigInt(authorization.validBefore);
  } catch {
    return { isValid: false, invalidReason: "invalid_payload", payer };
  }
  if (!isAddressEqual(authorization.to, paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
      payer,
    };
  }
  if (value !== BigInt(paymentRequirements.amount)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value",
      payer,
    };
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validAfter > now) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_after",
      payer,
    };
  }
  if (validBefore < now + BigInt(SETTLE_MARGIN_SECONDS)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
      payer,
    };
  }

  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({
      domain: {
        name: paymentRequirements.extra?.name ?? USDC_EIP712_NAME,
        version: paymentRequirements.extra?.version ?? USDC_EIP712_VERSION,
        chainId: SEPOLIA_CHAIN_ID,
        verifyingContract: USDC_SEPOLIA_ADDRESS,
      },
      types: transferTypes,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value,
        validAfter,
        validBefore,
        nonce: authorization.nonce,
      },
      signature: signature as Hex,
    });
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature",
      payer,
    };
  }
  if (!isAddressEqual(signer, payer)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature",
      payer,
    };
  }

  const client = createPublicClient({
    chain: sepolia,
    transport: http(input.rpcUrl),
  });
  const [balance, used] = await Promise.all([
    client.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: usdcReadAbi,
      functionName: "balanceOf",
      args: [payer],
    }),
    client.readContract({
      address: USDC_SEPOLIA_ADDRESS,
      abi: usdcReadAbi,
      functionName: "authorizationState",
      args: [payer, authorization.nonce],
    }),
  ]);
  if (used) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_nonce_used",
      payer,
    };
  }
  if (balance < value) {
    return { isValid: false, invalidReason: "insufficient_funds", payer };
  }
  return { isValid: true, payer };
}

/**
 * Facilitator side. Verifies again, then broadcasts transferWithAuthorization.
 * The submitter pays gas. Public facilitators do not settle on Ethereum Sepolia,
 * so AgentLatch runs this one for its demo sellers.
 */
export async function settleExactUsdc(input: {
  request: FacilitatorRequest;
  submitter: AgentSigner;
  rpcUrl: string;
}): Promise<SettleResponse> {
  const verified = await verifyExactUsdc(input);
  if (!verified.isValid) {
    return {
      success: false,
      errorReason: verified.invalidReason,
      payer: verified.payer,
      transaction: "",
      network: X402_NETWORK,
    };
  }
  const { authorization, signature } = input.request.paymentPayload.payload;
  const data = encodeFunctionData({
    abi: transferWithAuthorizationAbi,
    functionName: "transferWithAuthorization",
    args: [
      authorization.from,
      authorization.to,
      BigInt(authorization.value),
      BigInt(authorization.validAfter),
      BigInt(authorization.validBefore),
      authorization.nonce,
      signature,
    ],
  });
  try {
    const transaction = await input.submitter.sendTransaction({
      to: USDC_SEPOLIA_ADDRESS,
      data,
    });
    return {
      success: true,
      payer: authorization.from,
      transaction,
      network: X402_NETWORK,
    };
  } catch (error) {
    return {
      success: false,
      errorReason:
        error instanceof Error ? error.message : "x402 settlement failed.",
      payer: authorization.from,
      transaction: "",
      network: X402_NETWORK,
    };
  }
}

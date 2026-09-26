import {
  type Address,
  type AgentSigner,
  type Hex,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";
import { createPublicClient, encodeFunctionData, http } from "viem";
import { sepolia } from "viem/chains";

const USDC = USDC_SEPOLIA_ADDRESS as Address;

/** Uniswap V3 SwapRouter02 on Ethereum Sepolia. */
export const UNISWAP_V3_SWAP_ROUTER =
  "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;

/** The only SWAP output: Sepolia WETH. */
export const UNISWAP_SWAP_OUTPUT =
  "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address;

/** 0.01% USDC/WETH pool, the fee tier with the best quote on the Sepolia factory. */
export const UNISWAP_SWAP_FEE = 100;

/** QuoterV2 on Ethereum Sepolia. */
const QUOTER = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as Address;

/** Keep 95% of the quoted WETH. There is no price oracle. */
const MIN_OUTPUT_BPS = 9500n;
const BPS = 10_000n;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const routerAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/**
 * Swaps Circle USDC to Sepolia WETH through SwapRouter02.
 * The signer is supplied. This module does not read a private key.
 * WETH is sent to the signer. The returned hash is the swap, after it lands.
 * An approve is broadcast first when the router allowance is short; that hash is not returned.
 */
export async function swapUsdcToWeth(input: {
  signer: AgentSigner;
  amountIn: bigint;
  rpcUrl: string;
}): Promise<Hex> {
  if (input.amountIn <= 0n) {
    throw new Error("USDC swap amount must be greater than zero.");
  }
  const client = createPublicClient({
    chain: sepolia,
    transport: http(input.rpcUrl),
  });
  const quoted = await client.simulateContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: USDC,
        tokenOut: UNISWAP_SWAP_OUTPUT,
        amountIn: input.amountIn,
        fee: UNISWAP_SWAP_FEE,
        sqrtPriceLimitX96: 0n,
      },
    ],
    account: input.signer.address,
  });
  const amountOut = quoted.result[0];
  const amountOutMinimum = (amountOut * MIN_OUTPUT_BPS) / BPS;
  if (amountOutMinimum <= 0n) {
    throw new Error("Uniswap quote is too small to swap.");
  }

  const allowance = await client.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.signer.address, UNISWAP_V3_SWAP_ROUTER],
  });
  if (allowance < input.amountIn) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [UNISWAP_V3_SWAP_ROUTER, input.amountIn],
    });
    await input.signer.sendTransaction({ to: USDC, data: approveData });
  }

  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: USDC,
        tokenOut: UNISWAP_SWAP_OUTPUT,
        fee: UNISWAP_SWAP_FEE,
        recipient: input.signer.address,
        amountIn: input.amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return input.signer.sendTransaction({
    to: UNISWAP_V3_SWAP_ROUTER,
    data,
  });
}

#!/usr/bin/env bun
import { formatUsdc, parseUsdc, UsdcAmountError } from "@agentlatch/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  type Action,
  getAction,
  getApproval,
  getPolicy,
  listMerchants,
  listPayments,
  recentActivity,
  submitPayment,
  submitSwap,
} from "./api";
import { quote } from "./quote";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function reply(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function refuse(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

/** What an agent needs from an action: the decision, and the transaction once paid. */
function payment(action: Action) {
  const settled = action.reasons
    .map(
      (reason) =>
        /^(?:x402 settled|usdc transfer|uniswap swap) (0x[0-9a-fA-F]{64})$/.exec(
          reason,
        )?.[1],
    )
    .find(Boolean);
  return {
    actionId: action.id,
    url: action.target,
    amountUsdc: action.amountUsdc,
    decision: action.decision,
    status: action.status,
    reasons: action.reasons,
    approvalRequestId: action.approvalRequestId,
    txHash: settled ?? null,
    next:
      action.status === "AWAITING_APPROVAL"
        ? "A human must approve this payment in World App. Call get_payment with actionId to follow it."
        : undefined,
  };
}

const server = new McpServer({ name: "agentlatch", version: "0.0.0" });

server.registerTool(
  "list_merchants",
  {
    title: "List x402 merchants",
    description:
      "Lists the x402 sellers in AgentLatch's registry, with their resource URL and price in Circle USDC on Ethereum Sepolia.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const merchants = await listMerchants();
      return reply(
        merchants.map((merchant) => ({
          ...merchant,
          priceUsdc: formatUsdc(merchant.amountBaseUnits),
        })),
      );
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "quote_resource",
  {
    title: "Quote an x402 resource",
    description:
      "Asks an x402 resource URL for its price without paying. Returns the USDC price and payee, or why AgentLatch cannot pay it.",
    inputSchema: { url: z.url().describe("The x402 resource URL.") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url }) => {
    try {
      const quoted = await quote(url);
      return reply({
        url: quoted.url,
        description: quoted.description,
        priceUsdc: quoted.priceUsdc,
        payTo: quoted.requirement.payTo,
        network: quoted.requirement.network,
        asset: quoted.requirement.asset,
      });
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "pay_resource",
  {
    title: "Pay an x402 resource",
    description:
      "Pays an x402 resource through AgentLatch. The agent's ENS policy decides: it pays now, waits for a human in World App, or blocks. Intercepta screens the payee first. Refuses when the price is above maxAmountUsdc.",
    inputSchema: {
      url: z.url().describe("The x402 resource URL."),
      maxAmountUsdc: z
        .string()
        .describe("Most USDC this agent will pay, for example 0.05."),
      note: z.string().optional().describe("Why the agent is paying."),
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  async ({ url, maxAmountUsdc, note }) => {
    try {
      const max = parseUsdc(maxAmountUsdc);
      const quoted = await quote(url);
      if (BigInt(quoted.requirement.amount) > max) {
        return refuse(
          `Resource asks ${quoted.priceUsdc} USDC, above the ${formatUsdc(max.toString())} USDC maximum.`,
        );
      }
      const action = await submitPayment({
        url: quoted.url,
        amountUsdc: quoted.priceUsdc,
        note,
      });
      return reply(payment(action));
    } catch (error) {
      if (error instanceof UsdcAmountError) {
        return refuse(error.message);
      }
      return refuse(error);
    }
  },
);

server.registerTool(
  "get_payment",
  {
    title: "Get an x402 payment",
    description:
      "Reads one payment by actionId: its decision, status, and settlement transaction.",
    inputSchema: { actionId: z.uuid() },
    annotations: { readOnlyHint: true },
  },
  async ({ actionId }) => {
    try {
      return reply(payment(await getAction(actionId)));
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "request_swap",
  {
    title: "Request a swap",
    description:
      "Asks AgentLatch to swap USDC to Sepolia WETH. The agent's ENS policy decides: it runs now, waits for a human in World App, or blocks.",
    inputSchema: {
      amountUsdc: z.string().describe("USDC amount, for example 0.2 or 0.5."),
      note: z.string().optional().describe("Why the agent is swapping."),
    },
    annotations: { destructiveHint: true },
  },
  async ({ amountUsdc, note }) => {
    try {
      return reply(payment(await submitSwap({ amountUsdc, note })));
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "wait_for_approval",
  {
    title: "Wait for an approval",
    description:
      "Polls one approval for up to 45 seconds. Returns when it is no longer pending, or while it is still pending.",
    inputSchema: { approvalId: z.uuid() },
    annotations: { readOnlyHint: true },
  },
  async ({ approvalId }) => {
    try {
      const deadline = Date.now() + 45_000;
      let approval = await getApproval(approvalId);
      while (approval.status === "PENDING" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        approval = await getApproval(approvalId);
      }
      return reply(approval);
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "get_policy",
  {
    title: "Get the agent policy",
    description:
      "Reads this agent's spending policy: autonomous limit, hard limit, and what it may do.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return reply(await getPolicy());
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "recent_activity",
  {
    title: "Recent activity",
    description: "The last 20 audit events for this agent, oldest first.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return reply(await recentActivity());
    } catch (error) {
      return refuse(error);
    }
  },
);

server.registerTool(
  "list_payments",
  {
    title: "List x402 payments",
    description: "Lists this agent's x402 payments, oldest first.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return reply((await listPayments()).map(payment));
    } catch (error) {
      return refuse(error);
    }
  },
);

await server.connect(new StdioServerTransport());

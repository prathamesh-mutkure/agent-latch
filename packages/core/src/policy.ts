import type { ActionType, Decision, Policy } from "./types";
import { formatUsdc } from "./usdc";

export type PolicyDecision = {
  decision: Decision;
  reasons: string[];
};

export function evaluatePolicy(input: {
  policy: Policy | undefined;
  action: ActionType;
  target: string;
  token: string;
  amount: bigint;
  spentToday: bigint;
}): PolicyDecision {
  const { policy, action, target, token, amount, spentToday } = input;
  if (!policy) {
    return { decision: "BLOCK", reasons: ["Agent has no policy."] };
  }

  if (target.trim().length === 0) {
    return { decision: "BLOCK", reasons: ["Action has no target."] };
  }

  if (!policy.allowedActions.includes(action)) {
    return {
      decision: "BLOCK",
      reasons: [`Action ${action} is not allowed for this agent.`],
    };
  }

  const normalizedToken = token.toLowerCase();
  if (
    !policy.allowedTokens.some(
      (allowed) => allowed.toLowerCase() === normalizedToken,
    )
  ) {
    return {
      decision: "BLOCK",
      reasons: ["Token is not allowed. This agent can spend USDC only."],
    };
  }

  if (
    policy.allowedTargets.length > 0 &&
    !policy.allowedTargets.some(
      (allowed) => allowed.toLowerCase() === target.toLowerCase(),
    )
  ) {
    return {
      decision: "BLOCK",
      reasons: [`Target ${target} is not allowed for this agent.`],
    };
  }

  const autonomous = BigInt(policy.autonomousLimit);
  const hard = BigInt(policy.hardLimit);
  const amountLabel = `${formatUsdc(amount.toString())} USDC`;

  if (amount > hard) {
    return {
      decision: "BLOCK",
      reasons: [
        `${amountLabel} is above the hard limit of ${formatUsdc(policy.hardLimit)} USDC.`,
      ],
    };
  }

  if (
    policy.dailyLimit !== null &&
    spentToday + amount > BigInt(policy.dailyLimit)
  ) {
    return {
      decision: "BLOCK",
      reasons: [
        `${amountLabel} would exceed the daily limit of ${formatUsdc(policy.dailyLimit)} USDC.`,
      ],
    };
  }

  if (amount > autonomous) {
    return {
      decision: "HUMAN_APPROVAL",
      reasons: [
        `${amountLabel} is above the autonomous limit of ${formatUsdc(policy.autonomousLimit)} USDC.`,
      ],
    };
  }

  return {
    decision: "ALLOW",
    reasons: [
      `${amountLabel} is within the autonomous limit of ${formatUsdc(policy.autonomousLimit)} USDC.`,
    ],
  };
}

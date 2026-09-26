import {
  type ActionType,
  actionTypes,
  type Policy,
  parseUsdc,
  USDC_SEPOLIA_ADDRESS,
} from "@agentlatch/core";

const textKeys = {
  autonomousLimit: "policy.autonomousLimit",
  hardLimit: "policy.hardLimit",
  dailyLimit: "policy.dailyLimit",
  actions: "policy.actions",
  tokens: "policy.tokens",
  targets: "policy.targets",
} as const;

export type PolicyChange = "looser" | "tighter" | "same";

export function policyFromTexts(
  agentId: string,
  texts: Record<string, string | null>,
): Policy | null {
  const autonomousText = texts[textKeys.autonomousLimit];
  const hardText = texts[textKeys.hardLimit];
  const dailyText = texts[textKeys.dailyLimit];
  const actionText = texts[textKeys.actions];
  const tokenText = texts[textKeys.tokens];
  const targetText = texts[textKeys.targets];
  if (
    !autonomousText ||
    !hardText ||
    !dailyText ||
    !actionText ||
    !tokenText ||
    !targetText
  ) {
    return null;
  }

  let autonomous: bigint;
  let hard: bigint;
  try {
    autonomous = parseUsdc(autonomousText);
    hard = parseUsdc(hardText);
  } catch {
    return null;
  }
  const daily =
    dailyText === "none"
      ? null
      : (() => {
          try {
            return parseUsdc(dailyText);
          } catch {
            return undefined;
          }
        })();
  if (daily === undefined) {
    return null;
  }

  const allowedActions = actionText
    .split(",")
    .map((action) => action.trim())
    .filter((action): action is ActionType =>
      actionTypes.includes(action as ActionType),
    );
  if (allowedActions.length === 0 || tokenText !== "USDC") {
    return null;
  }

  return {
    agentId,
    autonomousLimit: autonomous.toString(),
    hardLimit: hard.toString(),
    dailyLimit: daily === null ? null : daily.toString(),
    allowedActions,
    allowedTokens: [USDC_SEPOLIA_ADDRESS.toLowerCase()],
    allowedTargets:
      targetText === "any"
        ? []
        : targetText
            .split(",")
            .map((target) => target.trim())
            .filter((target) => target.length > 0),
    updatedAt: new Date(0).toISOString(),
  };
}

/** A looser policy lets the agent spend more or reach a new action or target. */
export function policyChange(published: Policy, next: Policy): PolicyChange {
  const looser =
    BigInt(next.autonomousLimit) > BigInt(published.autonomousLimit) ||
    BigInt(next.hardLimit) > BigInt(published.hardLimit) ||
    dailyLoosens(published.dailyLimit, next.dailyLimit) ||
    addsAny(next.allowedActions, published.allowedActions) ||
    addsAny(next.allowedTokens, published.allowedTokens) ||
    targetsLoosen(published.allowedTargets, next.allowedTargets);
  if (looser) {
    return "looser";
  }
  const same =
    next.autonomousLimit === published.autonomousLimit &&
    next.hardLimit === published.hardLimit &&
    next.dailyLimit === published.dailyLimit &&
    sameSet(next.allowedActions, published.allowedActions) &&
    sameSet(next.allowedTokens, published.allowedTokens) &&
    sameSet(next.allowedTargets, published.allowedTargets);
  return same ? "same" : "tighter";
}

function dailyLoosens(published: string | null, next: string | null): boolean {
  if (published === null) {
    return false;
  }
  if (next === null) {
    return true;
  }
  return BigInt(next) > BigInt(published);
}

function addsAny(next: string[], published: string[]): boolean {
  const allowed = new Set(published.map((value) => value.toLowerCase()));
  return next.some((value) => !allowed.has(value.toLowerCase()));
}

function targetsLoosen(published: string[], next: string[]): boolean {
  if (published.length === 0) {
    return false;
  }
  if (next.length === 0) {
    return true;
  }
  return addsAny(next, published);
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const values = new Set(left.map((value) => value.toLowerCase()));
  return right.every((value) => values.has(value.toLowerCase()));
}

import { createHash } from "node:crypto";
import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";
import { type Client, createPublicClient, getAddress, http } from "viem";
import { worldchain } from "viem/chains";

export * from "./world-id";

export type BindingFields = {
  approvalId: string;
  agentId: string;
  action: string;
  target: string;
  token: string;
  amount: string;
  nonce: string;
  expiresAt: string;
};

/** Hash of the exact action an approval covers. Stored when the approval opens. */
export function computeBindingHash(fields: BindingFields): string {
  return createHash("sha256")
    .update(
      [
        fields.approvalId,
        fields.agentId,
        fields.action,
        fields.target.toLowerCase(),
        fields.token.toLowerCase(),
        fields.amount,
        fields.nonce,
        fields.expiresAt,
      ].join("|"),
    )
    .digest("hex");
}

/** What the owner chose in World App. */
export type Decision = "approve" | "deny";

/** Request ID signed when the owner links World App without claiming an agent. */
export const LINK_REQUEST_ID = "link";

/** Passed to `MiniKit.walletAuth` unchanged. The server rebuilds it to verify. */
export type DecisionChallenge = {
  nonce: string;
  statement: string;
  requestId: string;
  expirationTime: string;
};

/**
 * The sign-in the owner signs in World App to decide one approval. The nonce
 * hashes the decision into the binding hash, so a Deny signature can never
 * approve, and a signature for one approval fits no other.
 */
export function decisionChallenge(input: {
  approvalId: string;
  bindingHash: string;
  decision: Decision;
  agentName: string;
  action: string;
  amountUsdc: string;
  expiresAt: string;
}): DecisionChallenge {
  const verb = input.decision === "approve" ? "Approve" : "Deny";
  return {
    nonce: createHash("sha256")
      .update(`${input.bindingHash}|${input.decision}`)
      .digest("hex"),
    // SIWE statements must be one line.
    statement:
      `${verb} ${input.action} of ${input.amountUsdc} USDC for agent ${input.agentName}.`
        .replace(/\s+/g, " ")
        .trim(),
    requestId: input.approvalId,
    expirationTime: input.expiresAt,
  };
}

/** `MiniKit.walletAuth` result from World App. */
export type WalletAuthPayload = {
  address: string;
  message: string;
  signature: string;
};

export type WalletAuthCheck =
  | { ok: true; wallet: string }
  | { ok: false; error: string };

let chainClient: { url: string | undefined; client: Client } | undefined;

function worldChain(rpcUrl: string | undefined): Client {
  if (!chainClient || chainClient.url !== rpcUrl) {
    chainClient = {
      url: rpcUrl,
      client: createPublicClient({
        chain: worldchain,
        transport: http(rpcUrl),
      }),
    };
  }
  return chainClient.client;
}

/**
 * Verifies a World App sign-in on the server. World App wallets are Safe
 * accounts, so MiniKit falls back to EIP-1271 on World Chain when plain
 * signature recovery does not match. Returns the wallet in lower case.
 */
export async function verifyWalletAuth(
  payload: WalletAuthPayload,
  expected: { nonce: string; requestId: string; statement?: string },
  rpcUrl?: string,
): Promise<WalletAuthCheck> {
  let valid: boolean;
  try {
    const result = await verifySiweMessage(
      payload,
      expected.nonce,
      expected.statement,
      expected.requestId,
      worldChain(rpcUrl),
    );
    valid = result.isValid;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "World App signature could not be checked.",
    };
  }
  if (!valid) {
    return { ok: false, error: "World App signature is not valid." };
  }
  try {
    return { ok: true, wallet: getAddress(payload.address).toLowerCase() };
  } catch {
    return { ok: false, error: "World App wallet address is not valid." };
  }
}

const NOTIFY_URL =
  "https://developer.world.org/api/v2/minikit/send-notification";

export type NotificationResult =
  | { sent: true }
  | { sent: false; reason: string };

/** Sends one World App push that opens `path` inside the mini app. */
export async function sendNotification(input: {
  appId: string;
  apiKey: string;
  wallet: string;
  title: string;
  message: string;
  path: string;
}): Promise<NotificationResult> {
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  let response: Response;
  try {
    response = await fetch(NOTIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: input.appId,
        wallet_addresses: [input.wallet],
        title: clip(input.title, 30),
        message: clip(input.message, 200),
        mini_app_path: `worldapp://mini-app?app_id=${input.appId}&path=${path}`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "request failed",
    };
  }
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    detail?: string;
    result?: { sent?: boolean; reason?: string }[];
  } | null;
  if (!response.ok) {
    return {
      sent: false,
      reason: body?.code ?? body?.detail ?? `HTTP ${response.status}`,
    };
  }
  const item = body?.result?.[0];
  if (item?.sent !== true) {
    return { sent: false, reason: item?.reason ?? "not sent" };
  }
  return { sent: true };
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

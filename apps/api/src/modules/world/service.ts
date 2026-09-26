import {
  LINK_REQUEST_ID,
  verifyWalletAuth,
  type WalletAuthPayload,
} from "@agentlatch/world";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import type { Failure, Success } from "../../result";
import { agents } from "../agents/schema";
import { claimAgent } from "../agents/service";
import { type ApprovalDto, toApprovalDto } from "../approvals/dto";
import { listOwnerApprovals } from "../approvals/service";
import { getUserByWallet, upsertUserByWallet } from "../users/service";

const NONCE_TTL_MS = 10 * 60 * 1000;

// In memory: a restart only drops link attempts that are in flight.
const nonces = new Map<string, number>();

/** One-time sign-in nonce for linking World App or claiming an agent. */
export function issueNonce(now = Date.now()): string {
  for (const [nonce, expiresAt] of nonces) {
    if (expiresAt <= now) {
      nonces.delete(nonce);
    }
  }
  const nonce = crypto.randomUUID().replaceAll("-", "");
  nonces.set(nonce, now + NONCE_TTL_MS);
  return nonce;
}

function takeNonce(nonce: string, now = Date.now()): boolean {
  const expiresAt = nonces.get(nonce);
  nonces.delete(nonce);
  return expiresAt !== undefined && expiresAt > now;
}

export type OwnerView = {
  wallet: string;
  linked: boolean;
  agentIds: string[];
  pending: ApprovalDto[];
};

/** What the mini app shows for one World App wallet. */
export async function getOwner(wallet: string): Promise<OwnerView> {
  const normalized = wallet.toLowerCase();
  const user = await getUserByWallet(normalized);
  if (!user) {
    return { wallet: normalized, linked: false, agentIds: [], pending: [] };
  }
  const owned = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.userId, user.id))
    .orderBy(agents.createdAt);
  const pending = await listOwnerApprovals(user.id);
  return {
    wallet: normalized,
    linked: true,
    agentIds: owned.map((row) => row.id),
    pending: pending.map(toApprovalDto),
  };
}

/**
 * Links the World App wallet that signed, so approvals can be pushed to it.
 * With `agentId`, the same signature also claims that agent: the agent ID is
 * the signed request ID, so the signature cannot claim any other agent.
 */
export async function linkWorldApp(input: {
  nonce: string;
  agentId?: string;
  payload: WalletAuthPayload;
}): Promise<Success<OwnerView> | Failure> {
  if (!takeNonce(input.nonce)) {
    return {
      ok: false,
      status: 400,
      error: "World App sign-in expired. Try again.",
    };
  }
  const check = await verifyWalletAuth(
    input.payload,
    { nonce: input.nonce, requestId: input.agentId ?? LINK_REQUEST_ID },
    process.env.WORLDCHAIN_RPC_URL?.trim() || undefined,
  );
  if (!check.ok) {
    return { ok: false, status: 400, error: check.error };
  }
  const user = await upsertUserByWallet(check.wallet);
  if (input.agentId) {
    const claimed = await claimAgent(input.agentId, user.id);
    if (!claimed.ok) {
      return claimed;
    }
  }
  return { ok: true, value: await getOwner(check.wallet) };
}

import { createHash, timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";

/** World's orb credential. Asked for on every step-up so an old, weaker login cannot stand in. */
export const ORB_ACR = "https://world.org/oidc/acr/orb-v3";

/** Allowed clock drift between World and this server when checking `auth_time`. */
const CLOCK_SKEW_MS = 30_000;

export type WorldSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type WorldIdentity = {
  iss: string;
  sub: string;
  /** When the human last proved with World ID, from the ID token. */
  authTime: Date;
};

export type AuthorizeRequest = {
  url: string;
  state: string;
  nonce: string;
  verifier: string;
};

export class WorldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldError";
  }
}

/** World settings from the environment, or null when any is missing. */
export function worldSettings(
  env: Record<string, string | undefined> = process.env,
): WorldSettings | null {
  const issuer = env.WORLD_OIDC_ISSUER?.trim();
  const clientId = env.WORLD_CLIENT_ID?.trim();
  const clientSecret = env.WORLD_CLIENT_SECRET?.trim();
  const redirectUri = env.WORLD_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { issuer, clientId, clientSecret, redirectUri };
}

let cached: { key: string; config: Promise<oidc.Configuration> } | undefined;

/** Discovery document and signing keys, fetched once per process. */
function configuration(settings: WorldSettings): Promise<oidc.Configuration> {
  const key = `${settings.issuer}|${settings.clientId}`;
  if (cached?.key !== key) {
    const config = oidc
      .discovery(
        new URL(settings.issuer),
        settings.clientId,
        undefined,
        oidc.ClientSecretBasic(settings.clientSecret),
      )
      .catch((error) => {
        cached = undefined;
        throw error;
      });
    cached = { key, config };
  }
  return cached.config;
}

/**
 * Authorization URL for sign-in or a step-up. `fresh` forces a new World ID proof
 * even when the owner already has a World browser session.
 */
export async function buildAuthorizeUrl(
  settings: WorldSettings,
  options: { nonce?: string; fresh?: boolean } = {},
): Promise<AuthorizeRequest> {
  const config = await configuration(settings);
  const state = oidc.randomState();
  const nonce = options.nonce ?? oidc.randomNonce();
  const verifier = oidc.randomPKCECodeVerifier();
  const parameters: Record<string, string> = {
    redirect_uri: settings.redirectUri,
    scope: "openid",
    response_type: "code",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  };
  if (options.fresh) {
    parameters.max_age = "0";
    parameters.acr_values = ORB_ACR;
  }
  const url = oidc.buildAuthorizationUrl(config, parameters);
  return { url: url.href, state, nonce, verifier };
}

/**
 * Exchanges the callback code once and validates the ID token: signature, `iss`,
 * `aud`, `exp`, `state`, and `nonce`. A code is single use, so never retry this.
 */
export async function redeemCode(
  settings: WorldSettings,
  query: URLSearchParams,
  expected: { state: string; nonce: string; verifier: string },
): Promise<WorldIdentity> {
  const config = await configuration(settings);
  // Built from the registered redirect URI, not the request URL, because the
  // browser reaches the API through a proxy on another origin.
  const currentUrl = new URL(settings.redirectUri);
  currentUrl.search = query.toString();
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: expected.verifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) {
    throw new WorldError("World returned no ID token.");
  }
  if (typeof claims.auth_time !== "number") {
    throw new WorldError("World ID token has no auth_time.");
  }
  return {
    iss: claims.iss,
    sub: claims.sub,
    authTime: new Date(claims.auth_time * 1000),
  };
}

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

/** Hash of the exact action an approval covers. Sent to World as the step-up nonce. */
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

/** What the owner chose on the approve page. Both need a fresh World ID proof. */
export type StepUpDecision = "approve" | "deny";

/**
 * Step-up nonce for one decision on one action. Approve uses the binding hash
 * as is. Deny hashes the decision in, so a Deny proof can never approve.
 */
export function stepUpNonce(
  bindingHash: string,
  decision: StepUpDecision,
): string {
  return decision === "approve"
    ? bindingHash
    : createHash("sha256").update(`${bindingHash}|deny`).digest("hex");
}

/** Constant-time string comparison for `state` and hashes. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type TicketFailure =
  | "NOT_PENDING"
  | "EXPIRED"
  | "BINDING"
  | "WRONG_HUMAN"
  | "STALE_VERIFICATION";

export type TicketCheck = { ok: true } | { ok: false; reason: TicketFailure };

/**
 * Server-side checks on a validated World ticket, in order. Pure: the caller
 * reloads the approval and owner from the database first.
 */
export function checkApprovalTicket(input: {
  identity: WorldIdentity;
  approval: {
    status: string;
    expiresAt: Date;
    bindingHash: string | null;
    stepUpStartedAt: Date | null;
    fields: BindingFields;
  };
  owner: { iss: string; sub: string } | null;
  /** Nonce from the attempt cookie. The ID token nonce already matched it. */
  cookieNonce: string;
  decision: StepUpDecision;
  now: Date;
}): TicketCheck {
  const { identity, approval, owner, cookieNonce, decision, now } = input;
  if (approval.status !== "PENDING") {
    return { ok: false, reason: "NOT_PENDING" };
  }
  if (approval.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  const current = computeBindingHash(approval.fields);
  if (
    !approval.bindingHash ||
    !sameSecret(approval.bindingHash, current) ||
    !sameSecret(cookieNonce, stepUpNonce(current, decision))
  ) {
    return { ok: false, reason: "BINDING" };
  }
  if (!owner || owner.iss !== identity.iss || owner.sub !== identity.sub) {
    return { ok: false, reason: "WRONG_HUMAN" };
  }
  const authTime = identity.authTime.getTime();
  if (
    !approval.stepUpStartedAt ||
    authTime < approval.stepUpStartedAt.getTime() - CLOCK_SKEW_MS ||
    authTime > now.getTime() + CLOCK_SKEW_MS
  ) {
    return { ok: false, reason: "STALE_VERIFICATION" };
  }
  return { ok: true };
}

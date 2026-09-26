import * as oidc from "openid-client";

/** The authentication class World ID for Agents issues for a World proof. */
export const ORB_ACR = "https://world.org/oidc/acr/orb-v3";

/** Allowed clock drift between World and this server when checking `auth_time`. */
const CLOCK_SKEW_MS = 60 * 1000;

/** A confidential OIDC client registered in the World ID for Agents portal. */
export type WorldIdSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
};

/**
 * One RFC 8628 device authorization. The person opens `verificationUrl`,
 * checks `userCode`, proves with World ID, and approves or denies there.
 * `deviceCode` is redeemable with the client secret and never leaves the API.
 */
export type DeviceCheck = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  /** Seconds between token polls. */
  interval: number;
  expiresAt: Date;
};

/** Claims from a World ID token whose signature and claims were validated. */
export type VerifiedHuman = {
  issuer: string;
  /** Pairwise subject for this client's sector. Keep it in the backend. */
  subject: string;
  authTime: Date;
  acr: string;
};

export type DeviceOutcome =
  | { status: "verified"; human: VerifiedHuman }
  /** The person pressed Deny on World ID. */
  | { status: "denied" }
  /** World ID expired the device code. */
  | { status: "expired" }
  /** The caller's signal ended polling first. */
  | { status: "stopped" }
  /** World was unreachable, refused the request, or the token failed validation. */
  | { status: "failed"; error: string };

let cached: { key: string; config: Promise<oidc.Configuration> } | undefined;

// Discovery once per client. ID token signatures are checked against World's JWKS.
function configFor(settings: WorldIdSettings): Promise<oidc.Configuration> {
  const key = `${settings.issuer}|${settings.clientId}`;
  if (!cached || cached.key !== key) {
    const config = oidc.discovery(
      new URL(settings.issuer),
      settings.clientId,
      undefined,
      oidc.ClientSecretBasic(settings.clientSecret),
      { execute: [oidc.enableNonRepudiationChecks], timeout: 10 },
    );
    config.catch(() => {
      if (cached?.config === config) {
        cached = undefined;
      }
    });
    cached = { key, config };
  }
  return cached.config;
}

/** Readable reason for a failed World ID request. Never includes credentials. */
export function worldIdError(error: unknown): string {
  if (error instanceof oidc.ResponseBodyError) {
    return error.error_description
      ? `World ID: ${error.error} (${error.error_description})`
      : `World ID: ${error.error}`;
  }
  if (error instanceof Error && error.message) {
    return `World ID: ${error.message}`;
  }
  return "World ID request failed.";
}

/** Starts a device authorization. Device grants always require a fresh World proof. */
export async function startDeviceCheck(
  settings: WorldIdSettings,
): Promise<DeviceCheck> {
  const config = await configFor(settings);
  const response = await oidc.initiateDeviceAuthorization(config, {
    scope: "openid",
  });
  if (!response.verification_uri_complete) {
    throw new Error("World ID did not return an approval link.");
  }
  return {
    deviceCode: response.device_code,
    userCode: response.user_code,
    verificationUrl: response.verification_uri_complete,
    interval: response.interval ?? 5,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
  };
}

/**
 * Polls the token endpoint until the person approves or denies on World ID,
 * the device code expires, or `signal` aborts. A token counts only after its
 * signature, issuer, audience, and expiry check out, it carries the Orb class,
 * and its `auth_time` falls after `startedAt`.
 */
export async function waitForDeviceCheck(
  settings: WorldIdSettings,
  check: DeviceCheck & { startedAt: Date },
  signal: AbortSignal,
): Promise<DeviceOutcome> {
  const remainingMs = check.expiresAt.getTime() - Date.now();
  if (remainingMs <= 0) {
    return { status: "expired" };
  }
  let tokens: Awaited<ReturnType<typeof oidc.pollDeviceAuthorizationGrant>>;
  try {
    const config = await configFor(settings);
    tokens = await oidc.pollDeviceAuthorizationGrant(
      config,
      {
        device_code: check.deviceCode,
        user_code: check.userCode,
        verification_uri: check.verificationUrl,
        verification_uri_complete: check.verificationUrl,
        expires_in: Math.ceil(remainingMs / 1000),
        interval: check.interval,
      },
      undefined,
      { signal: AbortSignal.any([signal, AbortSignal.timeout(remainingMs)]) },
    );
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError) {
      if (error.error === "access_denied") {
        return { status: "denied" };
      }
      if (error.error === "expired_token") {
        return { status: "expired" };
      }
    }
    if (signal.aborted) {
      return { status: "stopped" };
    }
    if (check.expiresAt.getTime() <= Date.now()) {
      return { status: "expired" };
    }
    return { status: "failed", error: worldIdError(error) };
  }
  return checkIdToken(tokens.claims(), check.startedAt);
}

function checkIdToken(
  claims: oidc.IDToken | undefined,
  startedAt: Date,
): DeviceOutcome {
  if (!claims) {
    return { status: "failed", error: "World ID returned no ID token." };
  }
  if (claims.acr !== ORB_ACR) {
    return {
      status: "failed",
      error: `World ID returned assurance ${String(claims.acr ?? "none")}, not ${ORB_ACR}.`,
    };
  }
  if (typeof claims.auth_time !== "number") {
    return { status: "failed", error: "World ID token has no auth_time." };
  }
  const authTime = new Date(claims.auth_time * 1000);
  if (
    authTime.getTime() < startedAt.getTime() - CLOCK_SKEW_MS ||
    authTime.getTime() > Date.now() + CLOCK_SKEW_MS
  ) {
    return {
      status: "failed",
      error: "World ID proof is not from this request.",
    };
  }
  return {
    status: "verified",
    human: {
      issuer: claims.iss,
      subject: claims.sub,
      authTime,
      acr: claims.acr,
    },
  };
}

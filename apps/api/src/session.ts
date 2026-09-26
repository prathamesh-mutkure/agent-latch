import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** The signed-in owner: a World App wallet and its `users` row. */
export type Owner = { userId: string; wallet: string };

/** Bearer token for one owner. Kept by the browser, sent as `Authorization`. */
export type Session = { token: string; wallet: string; expiresAt: string };

let fallbackSecret: string | undefined;

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString("hex");
    console.log(
      "SESSION_SECRET is not set: every sign-in ends when the API restarts",
    );
  }
  return fallbackSecret;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function issueSession(owner: Owner, now = Date.now()): Session {
  const expiresAt = now + SESSION_TTL_MS;
  const body = Buffer.from(
    JSON.stringify({ u: owner.userId, w: owner.wallet, e: expiresAt }),
  ).toString("base64url");
  return {
    token: `${body}.${mac(body)}`,
    wallet: owner.wallet,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function readSession(
  authorization: string | undefined,
  now = Date.now(),
): Owner | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const [body, signature, extra] = token?.split(".") ?? [];
  if (!body || !signature || extra !== undefined) {
    return null;
  }
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    if (
      typeof claims !== "object" ||
      claims === null ||
      !("u" in claims && "w" in claims && "e" in claims) ||
      typeof claims.u !== "string" ||
      typeof claims.w !== "string" ||
      typeof claims.e !== "number" ||
      claims.e <= now
    ) {
      return null;
    }
    return { userId: claims.u, wallet: claims.w };
  } catch {
    return null;
  }
}

/** `signedIn: true` on a route answers 401 without a valid session and adds `owner`. */
export const session = new Elysia({ name: "session" }).macro({
  signedIn: {
    resolve({ headers, status }) {
      const owner = readSession(headers.authorization);
      if (!owner) {
        return status(401, { error: "Sign in with World App." });
      }
      return { owner };
    },
  },
});

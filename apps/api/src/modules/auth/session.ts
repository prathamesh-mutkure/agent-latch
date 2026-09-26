import { createHmac } from "node:crypto";
import { type StepUpDecision, sameSecret } from "@agentlatch/world";
import { Elysia } from "elysia";

export const SESSION_COOKIE = "al_session";
export const ATTEMPT_COOKIE = "al_world_attempt";
export const SIWE_COOKIE = "al_siwe";

export const SESSION_TTL_S = 7 * 24 * 60 * 60;
export const ATTEMPT_TTL_S = 10 * 60;

export type Session = { userId: string; exp: number };

/** One in-flight World redirect: sign-in, or a step-up for one approval. */
export type Attempt = {
  kind: "login" | "step-up";
  decision?: StepUpDecision;
  state: string;
  nonce: string;
  verifier: string;
  approvalId?: string;
  /** World transaction this server started. Absent on a plain sign-in. */
  transactionId?: string;
  /** Initiator cookie for that transaction. Stays on the API. */
  initiatorCookie?: string;
  startedAt: number;
  exp: number;
};

function cookieSecret(): string | null {
  const secret = process.env.COOKIE_SECRET?.trim();
  return secret ? secret : null;
}

function mac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `base64url(json).hmac`. Tampered, expired, or unsigned values read as null. */
export function sealCookie<T extends { exp: number }>(value: T): string | null {
  const secret = cookieSecret();
  if (!secret) {
    return null;
  }
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export function openCookie<T extends { exp: number }>(raw: unknown): T | null {
  const secret = cookieSecret();
  if (!secret || typeof raw !== "string") {
    return null;
  }
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !sameSecret(signature, mac(secret, payload))) {
    return null;
  }
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as T;
    return typeof value.exp === "number" && value.exp * 1000 > Date.now()
      ? value
      : null;
  } catch {
    return null;
  }
}

export const cookieDefaults = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function newSession(userId: string): string | null {
  return sealCookie({
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
  } satisfies Session);
}

/** Adds `userId` (or null) from the signed session cookie. */
export const session = new Elysia({ name: "session" }).derive(
  { as: "scoped" },
  ({ cookie }) => {
    const value = openCookie<Session>(cookie[SESSION_COOKIE]?.value);
    return { userId: value?.userId ?? null };
  },
);

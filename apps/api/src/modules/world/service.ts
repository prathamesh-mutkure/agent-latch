import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  LINK_REQUEST_ID,
  verifyWalletAuth,
  type WalletAuthPayload,
} from "@agentlatch/world";
import type { Failure, Success } from "../../result";
import { issueSession, type Owner, type Session } from "../../session";
import {
  type Account,
  getAccount,
  type User,
  upsertUserByWallet,
} from "../users/service";

const NONCE_TTL_MS = 10 * 60 * 1000;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// In memory: a restart only drops sign-ins that are in flight.
const nonces = new Map<string, number>();
const pairings = new Map<
  string,
  { secret: string; expiresAt: number; session?: Session }
>();

/** One-time nonce for a World App sign-in. */
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

export type SignedIn = { session: Session; account: Account };

type SignedWalletAuth = { nonce: string; payload: WalletAuthPayload };

/** Checks a one-time World App signature and returns its owner, creating one on first sign-in. */
async function verifiedUser(
  input: SignedWalletAuth,
  expected: { requestId: string; statement?: string },
): Promise<Success<User> | Failure> {
  if (!takeNonce(input.nonce)) {
    return {
      ok: false,
      status: 400,
      error: "World App sign-in expired. Try again.",
    };
  }
  const check = await verifyWalletAuth(
    input.payload,
    { nonce: input.nonce, ...expected },
    process.env.WORLDCHAIN_RPC_URL?.trim() || undefined,
  );
  if (!check.ok) {
    return { ok: false, status: 400, error: check.error };
  }
  return { ok: true, value: await upsertUserByWallet(check.wallet) };
}

function ownerOf(user: User): Owner {
  return { userId: user.id, wallet: user.worldWallet };
}

async function signedIn(user: User): Promise<SignedIn> {
  const owner = ownerOf(user);
  const account = await getAccount(owner);
  if (!account) {
    throw new Error("Signed-in user has no row.");
  }
  return { session: issueSession(owner), account };
}

/** Sign-in inside World App. The first sign-in creates the owner. */
export async function signInWorldApp(
  input: SignedWalletAuth,
): Promise<Success<SignedIn> | Failure> {
  const user = await verifiedUser(input, { requestId: LINK_REQUEST_ID });
  return user.ok ? { ok: true, value: await signedIn(user.value) } : user;
}

function pairingCode(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return code;
}

function prunePairings(now: number) {
  for (const [code, pairing] of pairings) {
    if (pairing.expiresAt <= now) {
      pairings.delete(code);
    }
  }
}

function livePairing(code: string) {
  prunePairings(Date.now());
  return pairings.get(code);
}

const PAIRING_GONE: Failure = {
  ok: false,
  status: 404,
  error: "This sign-in code expired. Scan the new code on the computer.",
};

/**
 * The computer asks to sign in. The QR code carries `code`. Only the computer
 * holds `secret`, so whoever sees the QR code cannot collect the session.
 */
export function startPairing(now = Date.now()) {
  prunePairings(now);
  let code = pairingCode();
  while (pairings.has(code)) {
    code = pairingCode();
  }
  const secret = randomBytes(32).toString("hex");
  const expiresAt = now + PAIRING_TTL_MS;
  pairings.set(code, { secret, expiresAt });
  return { code, secret, expiresAt: new Date(expiresAt).toISOString() };
}

function pairingStatement(code: string): string {
  return `Sign in to DSAP on the computer showing ${code.slice(0, 4)}-${code.slice(4)}.`;
}

/** What World App signs to sign the computer in. Passed to `MiniKit.walletAuth` as is. */
export function pairingChallenge(code: string):
  | Success<{
      code: string;
      nonce: string;
      statement: string;
      requestId: string;
      expirationTime: string;
    }>
  | Failure {
  const pairing = livePairing(code);
  if (!pairing || pairing.session) {
    return PAIRING_GONE;
  }
  return {
    ok: true,
    value: {
      code,
      nonce: issueNonce(),
      statement: pairingStatement(code),
      requestId: `pair-${code}`,
      expirationTime: new Date(pairing.expiresAt).toISOString(),
    },
  };
}

/** The phone signed the pairing challenge. Signs the phone in too. */
export async function confirmPairing(
  code: string,
  input: SignedWalletAuth,
): Promise<Success<SignedIn> | Failure> {
  const waiting = livePairing(code);
  if (!waiting || waiting.session) {
    return PAIRING_GONE;
  }
  const user = await verifiedUser(input, {
    requestId: `pair-${code}`,
    statement: pairingStatement(code),
  });
  if (!user.ok) {
    return user;
  }
  const pairing = livePairing(code);
  if (!pairing || pairing.session) {
    return PAIRING_GONE;
  }
  pairing.session = issueSession(ownerOf(user.value));
  return { ok: true, value: await signedIn(user.value) };
}

export type PairingState =
  | { status: "waiting" }
  | { status: "signed_in"; session: Session };

/** The computer polls with its secret. Hands the session over once. */
export function collectPairing(
  code: string,
  secret: string,
): Success<PairingState> | Failure {
  const pairing = livePairing(code);
  const expected = Buffer.from(pairing?.secret ?? "");
  const given = Buffer.from(secret);
  if (
    !pairing ||
    expected.length !== given.length ||
    !timingSafeEqual(expected, given)
  ) {
    return PAIRING_GONE;
  }
  if (!pairing.session) {
    return { ok: true, value: { status: "waiting" } };
  }
  pairings.delete(code);
  return {
    ok: true,
    value: { status: "signed_in", session: pairing.session },
  };
}

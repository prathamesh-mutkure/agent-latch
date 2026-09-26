import {
  buildAuthorizeUrl,
  redeemCode,
  sameSecret,
  stepUpNonce,
  worldSettings,
} from "@agentlatch/world";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  cancelStepUp,
  decideWithWorld,
  type StepUpResult,
  startStepUp,
} from "../approvals/service";
import { getUser, upsertUser } from "../users/service";
import {
  ATTEMPT_COOKIE,
  ATTEMPT_TTL_S,
  type Attempt,
  cookieDefaults,
  newSession,
  openCookie,
  SESSION_COOKIE,
  SESSION_TTL_S,
  sealCookie,
  session,
} from "./session";

const NOT_CONFIGURED =
  "World ID is not configured. Set WORLD_OIDC_ISSUER, WORLD_CLIENT_ID, WORLD_CLIENT_SECRET, WORLD_REDIRECT_URI, and COOKIE_SECRET.";

const stepUpQuery = z.object({
  approval: z.uuid(),
  decision: z.enum(["approve", "deny"]).default("approve"),
});

function approvePage(approvalId: string, result: StepUpResult | string) {
  return `/approve/${approvalId}?result=${result}`;
}

function refusalResult(status: number): string {
  if (status === 403) {
    return "not_owner";
  }
  if (status === 404) {
    return "not_found";
  }
  return "not_pending";
}

function clearCookie(
  jar: { set(config: Record<string, unknown>): unknown } | undefined,
) {
  jar?.set({ value: "", ...cookieDefaults, maxAge: 0 });
}

export const authRoutes = new Elysia()
  .use(session)
  .get("/auth/world/login", async ({ cookie, redirect, set }) => {
    const settings = worldSettings();
    if (!settings || !process.env.COOKIE_SECRET) {
      set.status = 503;
      return { error: NOT_CONFIGURED };
    }
    const request = await buildAuthorizeUrl(settings);
    const now = Date.now();
    const attempt = sealCookie({
      kind: "login",
      state: request.state,
      nonce: request.nonce,
      verifier: request.verifier,
      startedAt: now,
      exp: Math.floor(now / 1000) + ATTEMPT_TTL_S,
    } satisfies Attempt);
    cookie[ATTEMPT_COOKIE]?.set({
      value: attempt ?? "",
      ...cookieDefaults,
      maxAge: ATTEMPT_TTL_S,
    });
    return redirect(request.url, 302);
  })
  .get(
    "/auth/world/step-up",
    async ({ query, cookie, redirect, set, userId }) => {
      const settings = worldSettings();
      if (!settings || !process.env.COOKIE_SECRET) {
        set.status = 503;
        return { error: NOT_CONFIGURED };
      }
      if (!userId) {
        return redirect(approvePage(query.approval, "signed_out"), 302);
      }
      const started = await startStepUp(query.approval, userId);
      if (!started.ok) {
        return redirect(
          approvePage(query.approval, refusalResult(started.status)),
          302,
        );
      }
      // The ID token must carry this nonce, so the ticket fits this one
      // decision on this one action.
      const request = await buildAuthorizeUrl(settings, {
        nonce: stepUpNonce(started.value.bindingHash, query.decision),
        fresh: true,
      });
      const now = Date.now();
      const attempt = sealCookie({
        kind: "step-up",
        state: request.state,
        nonce: request.nonce,
        verifier: request.verifier,
        approvalId: query.approval,
        decision: query.decision,
        startedAt: now,
        exp: Math.floor(now / 1000) + ATTEMPT_TTL_S,
      } satisfies Attempt);
      cookie[ATTEMPT_COOKIE]?.set({
        value: attempt ?? "",
        ...cookieDefaults,
        maxAge: ATTEMPT_TTL_S,
      });
      return redirect(request.url, 302);
    },
    { query: stepUpQuery },
  )
  .get(
    "/auth/world/callback",
    async ({ request, cookie, redirect, set, userId }) => {
      const settings = worldSettings();
      if (!settings) {
        set.status = 503;
        return { error: NOT_CONFIGURED };
      }
      const attempt = openCookie<Attempt>(cookie[ATTEMPT_COOKIE]?.value);
      // Single use: a replayed callback finds no attempt.
      clearCookie(cookie[ATTEMPT_COOKIE]);
      const query = new URL(request.url).searchParams;
      const back =
        attempt?.kind === "step-up" && attempt.approvalId
          ? (result: string) =>
              redirect(approvePage(attempt.approvalId ?? "", result), 302)
          : (result: string) => redirect(`/?login=${result}`, 302);

      if (!attempt) {
        return back("invalid_attempt");
      }
      if (!sameSecret(query.get("state") ?? "", attempt.state)) {
        return back("invalid_attempt");
      }
      if (query.get("error")) {
        if (attempt.kind === "step-up" && attempt.approvalId) {
          return back(
            await cancelStepUp(
              attempt.approvalId,
              userId,
              attempt.decision ?? "approve",
            ),
          );
        }
        return back("cancelled");
      }

      let identity: Awaited<ReturnType<typeof redeemCode>>;
      try {
        identity = await redeemCode(settings, query, attempt);
      } catch (error) {
        // The message names the failed check. Never log the token or the query.
        console.log(
          `world callback rejected: ${error instanceof Error ? error.name : "error"} ${
            error instanceof Error ? error.message : ""
          }`,
        );
        return back("invalid_ticket");
      }

      if (attempt.kind === "login") {
        const user = await upsertUser(identity.iss, identity.sub);
        cookie[SESSION_COOKIE]?.set({
          value: newSession(user.id) ?? "",
          ...cookieDefaults,
          maxAge: SESSION_TTL_S,
        });
        return redirect("/", 302);
      }

      if (!attempt.approvalId) {
        return back("invalid_attempt");
      }
      const result = await decideWithWorld(
        attempt.approvalId,
        identity,
        attempt.nonce,
        attempt.decision ?? "approve",
      );
      return back(result);
    },
  )
  .post("/auth/logout", ({ cookie }) => {
    clearCookie(cookie[SESSION_COOKIE]);
    return { ok: true };
  })
  .get("/me", async ({ userId, set }) => {
    const user = userId ? await getUser(userId) : undefined;
    if (!user) {
      set.status = 401;
      return { error: "Not signed in." };
    }
    return user;
  });

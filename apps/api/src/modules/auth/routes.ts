import {
  beginStepUp,
  buildAuthorizeUrl,
  completeStepUp,
  readStepUp,
  redeemCode,
  sameSecret,
  stepUpNonce,
  worldSettings,
} from "@agentlatch/world";
import { Elysia } from "elysia";
import { z } from "zod";
import { toApprovalDto } from "../approvals/dto";
import {
  cancelStepUp,
  decideWithWorld,
  listOwnerApprovals,
  type StepUpResult,
  startStepUp,
} from "../approvals/service";
import { notifyDecision } from "../notify/service";
import { getUser, linkWallet, upsertUser } from "../users/service";
import {
  ATTEMPT_COOKIE,
  ATTEMPT_TTL_S,
  type Attempt,
  cookieDefaults,
  newSession,
  openCookie,
  SESSION_COOKIE,
  SESSION_TTL_S,
  SIWE_COOKIE,
  sealCookie,
  session,
} from "./session";
import { verifyWalletProof } from "./wallet";

const NOT_CONFIGURED =
  "World ID is not configured. Set WORLD_OIDC_ISSUER, WORLD_CLIENT_ID, WORLD_CLIENT_SECRET, WORLD_REDIRECT_URI, and COOKIE_SECRET.";

const stepUpQuery = z.object({
  approval: z.uuid(),
  decision: z.enum(["approve", "deny"]).default("approve"),
});

const walletBody = z.object({
  address: z.string(),
  message: z.string(),
  signature: z.string(),
});

function walletNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => (byte % 36).toString(36)).join("");
}

function approvePage(approvalId: string, result: StepUpResult | string) {
  return `/approve/${approvalId}?result=${result}`;
}

function handoffPage(approvalId: string) {
  return `/approve/${approvalId}?handoff=1`;
}

/** One finish at a time per World transaction, so two polls cannot redeem one code. */
const finishing = new Set<string>();

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
    async ({ query, cookie, redirect, request, set, userId }) => {
      const wantsJson = request.headers
        .get("accept")
        ?.includes("application/json");
      const finish = (result: string) => {
        if (wantsJson) {
          return { result };
        }
        return redirect(approvePage(query.approval, result), 302);
      };
      const settings = worldSettings();
      if (!settings || !process.env.COOKIE_SECRET) {
        set.status = 503;
        return { error: NOT_CONFIGURED };
      }
      if (!userId) {
        return finish("signed_out");
      }
      const started = await startStepUp(query.approval, userId);
      if (!started.ok) {
        return finish(refusalResult(started.status));
      }
      // The ID token must carry this nonce, so the ticket fits this one
      // decision on this one action. The browser is sent to World's human
      // page, not the authorize URL, so it is not the initiator.
      let handoff: Awaited<ReturnType<typeof beginStepUp>>;
      try {
        handoff = await beginStepUp(settings, {
          nonce: stepUpNonce(started.value.bindingHash, query.decision),
        });
      } catch (error) {
        console.log(
          `world step-up did not start: ${error instanceof Error ? error.message : "error"}`,
        );
        return finish("invalid_ticket");
      }
      const now = Date.now();
      const attempt = sealCookie({
        kind: "step-up",
        state: handoff.state,
        nonce: handoff.nonce,
        verifier: handoff.verifier,
        approvalId: query.approval,
        decision: query.decision,
        transactionId: handoff.transactionId,
        initiatorCookie: handoff.initiatorCookie,
        startedAt: now,
        exp: Math.floor(now / 1000) + ATTEMPT_TTL_S,
      } satisfies Attempt);
      cookie[ATTEMPT_COOKIE]?.set({
        value: attempt ?? "",
        ...cookieDefaults,
        maxAge: ATTEMPT_TTL_S,
      });
      if (wantsJson) {
        return { humanUrl: handoff.humanUrl };
      }
      return redirect(handoffPage(query.approval), 302);
    },
    { query: stepUpQuery },
  )
  .get("/auth/world/step-up/status", async ({ cookie, set, userId }) => {
    set.headers["cache-control"] = "no-store";
    const settings = worldSettings();
    if (!settings) {
      set.status = 503;
      return { error: NOT_CONFIGURED };
    }
    if (!userId) {
      set.status = 401;
      return { error: "Sign in with World ID first." };
    }
    const attempt = openCookie<Attempt>(cookie[ATTEMPT_COOKIE]?.value);
    if (
      attempt?.kind !== "step-up" ||
      !attempt.approvalId ||
      !attempt.transactionId ||
      !attempt.initiatorCookie
    ) {
      return { phase: "idle" as const };
    }
    const humanUrl = new URL(
      `/authorize?transaction_id=${attempt.transactionId}`,
      settings.issuer,
    ).href;
    const view = await readStepUp(settings, {
      transactionId: attempt.transactionId,
      initiatorCookie: attempt.initiatorCookie,
    });
    if (view.status === "rejected") {
      clearCookie(cookie[ATTEMPT_COOKIE]);
      const result = await cancelStepUp(
        attempt.approvalId,
        userId,
        attempt.decision ?? "approve",
      );
      return { phase: "done" as const, result };
    }
    if (
      view.status === "expired" ||
      view.status === "failed" ||
      view.status === "world_id_3_not_available"
    ) {
      clearCookie(cookie[ATTEMPT_COOKIE]);
      return { phase: "done" as const, result: "world_closed" };
    }
    if (view.status !== "approved" || finishing.has(attempt.transactionId)) {
      return {
        phase: "waiting" as const,
        humanUrl,
        connectorUri: view.connectorUri,
        worldStatus: view.status,
      };
    }
    finishing.add(attempt.transactionId);
    try {
      let identity: Awaited<ReturnType<typeof completeStepUp>>;
      try {
        identity = await completeStepUp(settings, {
          transactionId: attempt.transactionId,
          initiatorCookie: attempt.initiatorCookie,
          state: attempt.state,
          nonce: attempt.nonce,
          verifier: attempt.verifier,
        });
      } catch (error) {
        console.log(
          `world step-up finish rejected: ${error instanceof Error ? error.message : "error"}`,
        );
        clearCookie(cookie[ATTEMPT_COOKIE]);
        return { phase: "done" as const, result: "invalid_ticket" };
      }
      clearCookie(cookie[ATTEMPT_COOKIE]);
      const result = await decideWithWorld(
        attempt.approvalId,
        identity,
        attempt.nonce,
        attempt.decision ?? "approve",
      );
      if (result === "paid" || result === "approved" || result === "denied") {
        await notifyDecision(attempt.approvalId, result);
      }
      return { phase: "done" as const, result };
    } finally {
      finishing.delete(attempt.transactionId);
    }
  })
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
      if (result === "paid" || result === "approved" || result === "denied") {
        await notifyDecision(attempt.approvalId, result);
      }
      return back(result);
    },
  )
  .get("/auth/world/app", () => ({
    appId: process.env.WORLD_APP_ID?.trim() || null,
  }))
  .get("/auth/world/nonce", ({ cookie, set, userId }) => {
    if (!userId || !process.env.COOKIE_SECRET) {
      set.status = 401;
      return { error: "Sign in with World ID before linking World App." };
    }
    const nonce = walletNonce();
    const now = Math.floor(Date.now() / 1000);
    cookie[SIWE_COOKIE]?.set({
      value:
        sealCookie({
          nonce,
          exp: now + ATTEMPT_TTL_S,
        }) ?? "",
      ...cookieDefaults,
      maxAge: ATTEMPT_TTL_S,
    });
    return { nonce };
  })
  .post(
    "/auth/world/wallet",
    async ({ body, cookie, set, userId }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Sign in with World ID before linking World App." };
      }
      const attempt = openCookie<{ nonce: string; exp: number }>(
        cookie[SIWE_COOKIE]?.value,
      );
      clearCookie(cookie[SIWE_COOKIE]);
      if (!attempt) {
        set.status = 400;
        return { error: "Wallet link expired. Start it again." };
      }
      const proof = await verifyWalletProof(body, attempt.nonce);
      if (!proof.ok) {
        set.status = 400;
        return { error: proof.error };
      }
      const linked = await linkWallet(userId, proof.address);
      if (!linked.ok) {
        set.status = linked.status;
        return { error: linked.error };
      }
      return linked.value;
    },
    { body: walletBody },
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
  })
  .get("/me/approvals", async ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: "Not signed in." };
    }
    const pending = await listOwnerApprovals(userId);
    return pending.map(toApprovalDto);
  });

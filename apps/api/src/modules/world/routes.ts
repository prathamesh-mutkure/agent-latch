import { Elysia } from "elysia";
import { respond } from "../../result";
import { worldIdSettings } from "../approvals/world-id";
import { collectPairingBody, pairingParams, signInBody } from "./schemas";
import {
  collectPairing,
  confirmPairing,
  issueNonce,
  pairingChallenge,
  signInWorldApp,
  startPairing,
} from "./service";

export const worldRoutes = new Elysia({ prefix: "/world" })
  .onBeforeHandle(({ set }) => {
    set.headers["cache-control"] = "no-store";
  })
  .get("/config", () => ({
    appId: process.env.WORLD_APP_ID?.trim() || null,
    worldIdReady: worldIdSettings() !== null,
  }))
  .get("/nonce", () => ({ nonce: issueNonce() }))
  .post(
    "/sign-in",
    async ({ body, set }) => respond(set, await signInWorldApp(body)),
    { body: signInBody },
  )
  // Desktop sign-in: the computer shows a QR code, World App signs it.
  .post("/pair", () => startPairing())
  .get(
    "/pair/:code",
    ({ params, set }) => respond(set, pairingChallenge(params.code)),
    { params: pairingParams },
  )
  .post(
    "/pair/:code",
    async ({ params, body, set }) =>
      respond(set, await confirmPairing(params.code, body)),
    { params: pairingParams, body: signInBody },
  )
  .post(
    "/pair/:code/session",
    ({ params, body, set }) =>
      respond(set, collectPairing(params.code, body.secret)),
    { params: pairingParams, body: collectPairingBody },
  );

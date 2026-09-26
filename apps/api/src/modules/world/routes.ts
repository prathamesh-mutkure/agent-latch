import { Elysia } from "elysia";
import { respond } from "../../result";
import { linkBody, walletParams } from "./schemas";
import { getOwner, issueNonce, linkWorldApp } from "./service";

export const worldRoutes = new Elysia({ prefix: "/world" })
  .get("/config", () => ({
    appId: process.env.WORLD_APP_ID?.trim() || null,
  }))
  .get("/nonce", ({ set }) => {
    set.headers["cache-control"] = "no-store";
    return { nonce: issueNonce() };
  })
  .post(
    "/link",
    async ({ body, set }) => respond(set, await linkWorldApp(body)),
    { body: linkBody },
  )
  .get("/owner/:wallet", async ({ params }) => getOwner(params.wallet), {
    params: walletParams,
  });

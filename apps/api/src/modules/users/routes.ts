import { Elysia } from "elysia";
import { z } from "zod";
import { respond } from "../../result";
import { session } from "../../session";
import { ensLabelSchema } from "../agents/schemas";
import { getAccount, setUsername } from "./service";

export const usersRoutes = new Elysia()
  .use(session)
  .get(
    "/me",
    async ({ owner, set }) => {
      const account = await getAccount(owner);
      if (!account) {
        set.status = 401;
        return { error: "Sign in with World App." };
      }
      return account;
    },
    { signedIn: true },
  )
  .put(
    "/me/username",
    async ({ owner, body, set }) =>
      respond(set, await setUsername(owner, body.username)),
    { body: z.object({ username: ensLabelSchema }), signedIn: true },
  );

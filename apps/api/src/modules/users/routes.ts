import { Elysia } from "elysia";
import { session } from "../../session";
import { getAccount } from "./service";

export const usersRoutes = new Elysia().use(session).get(
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
);

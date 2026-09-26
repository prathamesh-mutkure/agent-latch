import { Elysia } from "elysia";
import { respond } from "../../result";
import { session } from "../../session";
import { agentIdParams } from "../agents/schemas";
import { listAudit } from "./service";

export const auditRoutes = new Elysia().use(session).get(
  "/agents/:agentId/audit",
  async ({ params, owner, set }) => {
    const result = await listAudit(params.agentId, owner.userId);
    return respond(set, result);
  },
  { params: agentIdParams, signedIn: true },
);

import { Elysia } from "elysia";
import { readAgentAccess } from "../../agent-key";
import { respond } from "../../result";
import { agentIdParams } from "../agents/schemas";
import { listAudit } from "./service";

export const auditRoutes = new Elysia().get(
  "/agents/:agentId/audit",
  async ({ params, headers, set }) => {
    const access = await readAgentAccess(
      params.agentId,
      headers,
      "owner-or-key",
    );
    if (!access.ok) {
      return respond(set, access);
    }
    return respond(set, await listAudit(params.agentId));
  },
  { params: agentIdParams },
);

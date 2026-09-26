import { Elysia } from "elysia";
import { respond } from "../../result";
import { agentIdParams } from "../agents/schemas";
import { listAudit } from "./service";

export const auditRoutes = new Elysia().get(
  "/agents/:agentId/audit",
  async ({ params, set }) => {
    const result = await listAudit(params.agentId);
    return respond(set, result);
  },
  { params: agentIdParams },
);

import { Elysia } from "elysia";
import { respond } from "../../result";
import { toPolicyDto } from "./dto";
import { agentIdParams, createAgentBody, setPolicyBody } from "./schemas";
import {
  createAgent,
  getAgent,
  getPolicy,
  listAgents,
  setPolicy,
} from "./service";

export const agentsRoutes = new Elysia({ prefix: "/agents" })
  .post("/", async ({ body }) => createAgent(body.name), {
    body: createAgentBody,
  })
  .get("/", async () => listAgents())
  .get(
    "/:agentId",
    async ({ params, set }) => {
      const agent = await getAgent(params.agentId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      return agent;
    },
    { params: agentIdParams },
  )
  .put(
    "/:agentId/policy",
    async ({ params, body, set }) => {
      const result = await setPolicy(params.agentId, body);
      if (!result.ok) {
        return respond(set, result);
      }
      return toPolicyDto(result.value);
    },
    {
      params: agentIdParams,
      body: setPolicyBody,
    },
  )
  .get(
    "/:agentId/policy",
    async ({ params, set }) => {
      if (!(await getAgent(params.agentId))) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      const policy = await getPolicy(params.agentId);
      if (!policy) {
        set.status = 404;
        return { error: "Policy not found." };
      }
      return toPolicyDto(policy);
    },
    { params: agentIdParams },
  );

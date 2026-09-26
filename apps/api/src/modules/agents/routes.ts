import { Elysia, t } from "elysia";
import { respond } from "../../result";
import { session } from "../auth/session";
import { toPolicyDto } from "./dto";
import { readAgentEns, registerAgentEns } from "./ens";
import { agentIdParams, createAgentBody, setPolicyBody } from "./schemas";
import {
  claimAgent,
  createAgent,
  getAgent,
  getPolicy,
  listAgents,
  setPolicy,
} from "./service";

async function agentWithEns<T extends { name: string }>(agent: T) {
  return { ...agent, ens: await readAgentEns(agent.name) };
}

export const agentsRoutes = new Elysia({ prefix: "/agents" })
  .use(session)
  .post(
    "/",
    async ({ body, userId }) =>
      agentWithEns(await createAgent(body.name, userId)),
    { body: createAgentBody },
  )
  .get("/", async () => {
    const agents = await listAgents();
    return Promise.all(agents.map((agent) => agentWithEns(agent)));
  })
  .get(
    "/:agentId",
    async ({ params, set }) => {
      const agent = await getAgent(params.agentId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      return agentWithEns(agent);
    },
    { params: agentIdParams },
  )
  .post(
    "/:agentId/claim",
    async ({ params, set, userId }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Sign in with World ID to claim an agent." };
      }
      const result = await claimAgent(params.agentId, userId);
      if (!result.ok) {
        return respond(set, result);
      }
      return agentWithEns(result.value);
    },
    { params: agentIdParams },
  )
  .post(
    "/:agentId/ens",
    async ({ params, body, set }) => {
      const agent = await getAgent(params.agentId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      try {
        return await registerAgentEns(agent.name, body.owner);
      } catch (error) {
        set.status = 400;
        return {
          error:
            error instanceof Error ? error.message : "ENS registration failed.",
        };
      }
    },
    {
      params: agentIdParams,
      body: t.Object({
        owner: t.Optional(t.String()),
      }),
    },
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

import { Elysia, t } from "elysia";
import { readAgentAccess } from "../../agent-key";
import { respond } from "../../result";
import { session } from "../../session";
import { toPolicyDto } from "./dto";
import { readAgentEns, recordsToPublish, registerAgentEns } from "./ens";
import { agentIdParams, createAgentBody, setPolicyBody } from "./schemas";
import {
  createAgent,
  getOwnedAgent,
  getPolicy,
  issueAgentKey,
  listAgents,
  setPolicy,
} from "./service";

async function agentWithEns<T extends { name: string }>(agent: T) {
  return { ...agent, ens: await readAgentEns(agent.name) };
}

// Owner routes. Each one sees only the signed-in owner's agents.
export const agentsRoutes = new Elysia({ prefix: "/agents" })
  .use(session)
  .post(
    "/",
    async ({ body, owner, set }) => {
      const created = await createAgent(body.name, owner.userId);
      if (!created.ok) {
        return respond(set, created);
      }
      const policy = await setPolicy(created.value.agent.id, owner.userId, {
        autonomousLimit: "500",
        hardLimit: "5000",
      });
      return {
        ...(await agentWithEns(created.value.agent)),
        key: created.value.key,
        setupError: policy.ok ? null : policy.error,
      };
    },
    { body: createAgentBody, signedIn: true },
  )
  .get(
    "/",
    async ({ owner }) => {
      const agents = await listAgents(owner.userId);
      return Promise.all(agents.map((agent) => agentWithEns(agent)));
    },
    { signedIn: true },
  )
  .get(
    "/:agentId",
    async ({ params, owner, set }) => {
      const agent = await getOwnedAgent(params.agentId, owner.userId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      return agentWithEns(agent);
    },
    { params: agentIdParams, signedIn: true },
  )
  .post(
    "/:agentId/key",
    async ({ params, owner, set }) => {
      const issued = await issueAgentKey(params.agentId, owner.userId);
      if (!issued.ok) {
        return respond(set, issued);
      }
      return issued.value;
    },
    { params: agentIdParams, signedIn: true },
  )
  .post(
    "/:agentId/ens",
    async ({ params, body, owner, set }) => {
      const agent = await getOwnedAgent(params.agentId, owner.userId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      try {
        const policy = await getPolicy(agent.id);
        return await registerAgentEns(
          agent.name,
          body.owner,
          await recordsToPublish(agent.name, policy),
        );
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
      signedIn: true,
    },
  )
  .put(
    "/:agentId/policy",
    async ({ params, body, owner, set }) => {
      const result = await setPolicy(params.agentId, owner.userId, body);
      if (!result.ok) {
        return respond(set, result);
      }
      return toPolicyDto(result.value);
    },
    {
      params: agentIdParams,
      body: setPolicyBody,
      signedIn: true,
    },
  )
  .get(
    "/:agentId/policy",
    async ({
      params,
      headers,
      set,
    }): Promise<ReturnType<typeof toPolicyDto> | { error: string }> => {
      const access = await readAgentAccess(
        params.agentId,
        headers,
        "owner-or-key",
      );
      if (!access.ok) {
        set.status = access.status;
        return { error: access.error };
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

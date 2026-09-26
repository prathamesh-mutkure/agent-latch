import { Elysia, t } from "elysia";
import { readAgentAccess } from "../../agent-key";
import { respond } from "../../result";
import { session } from "../../session";
import { toPolicyDto } from "./dto";
import {
  type AgentName,
  agentEnsName,
  ensRegistration,
  readAgentEns,
  recordsToPublish,
  registerAgentEns,
  startEnsRegistration,
} from "./ens";
import { agentIdParams, createAgentBody, setPolicyBody } from "./schemas";
import {
  createAgent,
  getOwnedAgent,
  getPolicy,
  issueAgentKey,
  listAgents,
  setPolicy,
} from "./service";

async function agentWithEns<T extends AgentName & { id: string }>(agent: T) {
  return {
    ...agent,
    ensName: agentEnsName(agent),
    ens: await readAgentEns(agent),
    registration: ensRegistration(agent.id),
  };
}

// Owner routes. Each one sees only the signed-in owner's agents.
export const agentsRoutes = new Elysia({ prefix: "/agents" })
  .use(session)
  .post(
    "/",
    async ({ body, owner, set }) => {
      const created = await createAgent(body, owner.userId);
      if (!created.ok) {
        return respond(set, created);
      }
      const policy = await setPolicy(
        created.value.agent.id,
        owner.userId,
        body.policy ?? { autonomousLimit: "500", hardLimit: "5000" },
      );
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
      // Runs in the background. The agent list shows `registration` until
      // the name reads back as registered.
      set.status = 202;
      return startEnsRegistration(agent.id, async () =>
        registerAgentEns(
          agent,
          body.owner,
          await recordsToPublish(agent, await getPolicy(agent.id)),
        ),
      );
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

import { Elysia } from "elysia";
import { readAgentAccess } from "../../agent-key";
import { respond } from "../../result";
import {
  parseJsonKeepingRaw,
  verifyAgentRequest,
} from "../agents/request-auth";
import { getAgent } from "../agents/service";
import { type ActionDto, toActionDto } from "./dto";
import { actionIdParams, agentIdParams, submitActionBody } from "./schemas";
import { getAction, listActions, submitAction } from "./service";

export const actionRoutes = new Elysia()
  // Submitting spends, so it takes the agent key. The owner session is not enough.
  .post(
    "/agents/:agentId/actions",
    async ({ params, body, headers, request, set }) => {
      const access = await readAgentAccess(params.agentId, headers, "key");
      if (!access.ok) {
        return respond(set, access);
      }
      const agent = await getAgent(params.agentId);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found." };
      }
      // An agent with an ENS auth address also signs, on top of its key.
      const denied = await verifyAgentRequest(request, agent);
      if (denied) {
        return respond(set, denied);
      }
      const result = await submitAction({
        agentId: params.agentId,
        action: body.action,
        target: body.target,
        amount: body.amount,
        token: body.token,
        note: body.note,
      });
      if (!result.ok) {
        return respond(set, result);
      }
      return toActionDto(result.value);
    },
    {
      params: agentIdParams,
      body: submitActionBody,
      parse: parseJsonKeepingRaw,
    },
  )
  .get(
    "/agents/:agentId/actions",
    async ({
      params,
      headers,
      set,
    }): Promise<ActionDto[] | { error: string }> => {
      const access = await readAgentAccess(
        params.agentId,
        headers,
        "owner-or-key",
      );
      if (!access.ok) {
        set.status = access.status;
        return { error: access.error };
      }
      const result = await listActions(params.agentId);
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return Promise.all(result.value.map((action) => toActionDto(action)));
    },
    { params: agentIdParams },
  )
  .get(
    "/actions/:actionId",
    async ({ params, headers, set }) => {
      const action = await getAction(params.actionId);
      if (!action) {
        set.status = 404;
        return { error: "Action not found." };
      }
      const access = await readAgentAccess(
        action.agentId,
        headers,
        "owner-or-key",
      );
      if (!access.ok) {
        return respond(set, access);
      }
      return toActionDto(action);
    },
    { params: actionIdParams },
  );

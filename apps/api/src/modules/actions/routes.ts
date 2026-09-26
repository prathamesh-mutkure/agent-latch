import { Elysia } from "elysia";
import { respond } from "../../result";
import { type ActionDto, toActionDto } from "./dto";
import { actionIdParams, agentIdParams, submitActionBody } from "./schemas";
import { getAction, listActions, submitAction } from "./service";

export const actionRoutes = new Elysia()
  .post(
    "/agents/:agentId/actions",
    async ({ params, body, set }) => {
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
    },
  )
  .get(
    "/agents/:agentId/actions",
    async ({ params, set }): Promise<ActionDto[] | { error: string }> => {
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
    async ({ params, set }) => {
      const action = await getAction(params.actionId);
      if (!action) {
        set.status = 404;
        return { error: "Action not found." };
      }
      return toActionDto(action);
    },
    { params: actionIdParams },
  );

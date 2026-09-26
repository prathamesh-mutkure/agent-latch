import { Elysia } from "elysia";
import { respond } from "../../result";
import { toActionDto } from "./dto";
import { actionIdParams, agentIdParams, submitActionBody } from "./schemas";
import { getAction, listActions, submitAction } from "./service";

export const actionRoutes = new Elysia()
  .post(
    "/agents/:agentId/actions",
    ({ params, body, set }) => {
      const result = submitAction({
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
    ({ params, set }) => {
      const result = listActions(params.agentId);
      if (!result.ok) {
        return respond(set, result);
      }
      return result.value.map(toActionDto);
    },
    { params: agentIdParams },
  )
  .get(
    "/actions/:actionId",
    ({ params, set }) => {
      const action = getAction(params.actionId);
      if (!action) {
        set.status = 404;
        return { error: "Action not found." };
      }
      return toActionDto(action);
    },
    { params: actionIdParams },
  );

import { Elysia } from "elysia";
import { respond } from "../../result";
import { toApprovalDto } from "./dto";
import { approvalIdParams, challengeQuery, decideBody } from "./schemas";
import {
  decideInWorldApp,
  getApproval,
  getDecisionChallenge,
  listApprovals,
} from "./service";

// Approve and deny run only through `decide`, with a World App signature from
// the wallet that claimed the agent. The agent can read approvals, never decide.
export const approvalRoutes = new Elysia({ prefix: "/approvals" })
  .get("/", async () => (await listApprovals()).map(toApprovalDto))
  .get(
    "/:approvalId",
    async ({ params, set }) => {
      const approval = await getApproval(params.approvalId);
      if (!approval) {
        set.status = 404;
        return { error: "Approval not found." };
      }
      return toApprovalDto(approval);
    },
    { params: approvalIdParams },
  )
  .get(
    "/:approvalId/challenge",
    async ({ params, query, set }) => {
      set.headers["cache-control"] = "no-store";
      return respond(
        set,
        await getDecisionChallenge(params.approvalId, query.decision),
      );
    },
    { params: approvalIdParams, query: challengeQuery },
  )
  .post(
    "/:approvalId/decide",
    async ({ params, body, set }) => {
      const decided = await decideInWorldApp(
        params.approvalId,
        body.decision,
        body.payload,
      );
      return respond(
        set,
        decided.ok ? { ok: true, value: { result: decided.value } } : decided,
      );
    },
    { params: approvalIdParams, body: decideBody },
  );

import { Elysia } from "elysia";
import { respond } from "../../result";
import { session } from "../../session";
import { toApprovalDto } from "./dto";
import { approvalIdParams, challengeQuery, decideBody } from "./schemas";
import {
  decideInWorldApp,
  getApproval,
  getDecisionChallenge,
  listApprovals,
} from "./service";

// Approve and deny run only through `decide`, with a World App signature from
// the wallet that owns the agent. Approve also needs a World ID for Agents
// check that the API validates. The agent reads its approval by ID, never decides.
export const approvalRoutes = new Elysia({ prefix: "/approvals" })
  .use(session)
  .get(
    "/",
    async ({ owner }) => (await listApprovals(owner.userId)).map(toApprovalDto),
    { signedIn: true },
  )
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
      set.headers["cache-control"] = "no-store";
      return respond(
        set,
        await decideInWorldApp(params.approvalId, body.decision, body.payload),
      );
    },
    { params: approvalIdParams, body: decideBody },
  );

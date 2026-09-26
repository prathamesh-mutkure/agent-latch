import { Elysia } from "elysia";
import { toApprovalDto } from "./dto";
import { approvalIdParams } from "./schemas";
import { getApproval, listApprovals } from "./service";

// Approve and deny have no routes here. Both run only from the World step-up
// callback in the auth module, after the server checks a fresh World ID ticket.
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
  );

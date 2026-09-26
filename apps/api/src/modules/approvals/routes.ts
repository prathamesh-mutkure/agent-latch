import { Elysia } from "elysia";
import { respond } from "../../result";
import { toActionDto } from "../actions/dto";
import { toApprovalDto } from "./dto";
import { approvalIdParams } from "./schemas";
import { getApproval, listApprovals, resolveApproval } from "./service";

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
  .post(
    "/:approvalId/approve",
    async ({ params, set }) => {
      const result = await resolveApproval(params.approvalId, "approve");
      if (!result.ok) {
        return respond(set, result);
      }
      return {
        approval: toApprovalDto(result.value.approval),
        action: await toActionDto(result.value.action),
      };
    },
    { params: approvalIdParams },
  )
  .post(
    "/:approvalId/reject",
    async ({ params, set }) => {
      const result = await resolveApproval(params.approvalId, "reject");
      if (!result.ok) {
        return respond(set, result);
      }
      return {
        approval: toApprovalDto(result.value.approval),
        action: await toActionDto(result.value.action),
      };
    },
    { params: approvalIdParams },
  );

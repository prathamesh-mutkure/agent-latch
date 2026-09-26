import { Elysia } from "elysia";
import { respond } from "../../result";
import { toActionDto } from "../actions/dto";
import { toApprovalDto } from "./dto";
import { approvalIdParams } from "./schemas";
import { getApproval, listApprovals, resolveApproval } from "./service";

export const approvalRoutes = new Elysia({ prefix: "/approvals" })
  .get("/", () => listApprovals().map(toApprovalDto))
  .get(
    "/:approvalId",
    ({ params, set }) => {
      const approval = getApproval(params.approvalId);
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
    ({ params, set }) => {
      const result = resolveApproval(params.approvalId, "approve");
      if (!result.ok) {
        return respond(set, result);
      }
      return {
        approval: toApprovalDto(result.value.approval),
        action: toActionDto(result.value.action),
      };
    },
    { params: approvalIdParams },
  )
  .post(
    "/:approvalId/reject",
    ({ params, set }) => {
      const result = resolveApproval(params.approvalId, "reject");
      if (!result.ok) {
        return respond(set, result);
      }
      return {
        approval: toApprovalDto(result.value.approval),
        action: toActionDto(result.value.action),
      };
    },
    { params: approvalIdParams },
  );

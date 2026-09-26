import { z } from "zod";
import { decisionSchema, walletAuthPayloadSchema } from "../../schemas";

export const approvalIdParams = z.object({
  approvalId: z.uuid(),
});

export const challengeQuery = z.object({
  decision: decisionSchema,
});

export const decideBody = z.object({
  decision: decisionSchema,
  payload: walletAuthPayloadSchema,
});

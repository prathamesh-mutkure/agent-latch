import { z } from "zod";
import { actionTypeSchema } from "../../schemas";
import { agentIdParams } from "../agents/schemas";

export const actionIdParams = z.object({
  actionId: z.uuid(),
});

export const submitActionBody = z.object({
  action: actionTypeSchema,
  target: z.string().trim().min(1),
  amount: z.string().trim().min(1),
  token: z.string().trim().min(1).optional(),
  note: z.string().optional(),
});

export { agentIdParams };
export type SubmitActionBody = z.infer<typeof submitActionBody>;

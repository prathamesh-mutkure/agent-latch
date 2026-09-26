import { z } from "zod";
import { actionTypeSchema } from "../../schemas";

export const agentIdParams = z.object({
  agentId: z.uuid(),
});

export const createAgentBody = z.object({
  name: z.string().trim().min(1).max(64),
});

export const setPolicyBody = z.object({
  autonomousLimit: z.string().trim().min(1),
  hardLimit: z.string().trim().min(1),
  dailyLimit: z.string().trim().min(1).optional(),
  allowedActions: z.array(actionTypeSchema).min(1).optional(),
  allowedTargets: z.array(z.string().trim().min(1)).optional(),
});

export type CreateAgentBody = z.infer<typeof createAgentBody>;
export type SetPolicyBody = z.infer<typeof setPolicyBody>;

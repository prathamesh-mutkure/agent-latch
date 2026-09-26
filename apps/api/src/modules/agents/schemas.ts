import { z } from "zod";
import { actionTypeSchema, walletAddressSchema } from "../../schemas";

export const agentIdParams = z.object({
  agentId: z.uuid(),
});

/** One ENS label. Agent names and owner usernames. */
export const ensLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lower-case letters, digits, and dashes, starting and ending with a letter or digit.",
  );

export const setPolicyBody = z.object({
  autonomousLimit: z.string().trim().min(1),
  hardLimit: z.string().trim().min(1),
  dailyLimit: z.string().trim().min(1).optional(),
  allowedActions: z.array(actionTypeSchema).min(1).optional(),
  allowedTargets: z.array(z.string().trim().min(1)).optional(),
});

/** The name becomes `<name>.<username>.<parent>` on ENS, or `<name>.<parent>` without a username. */
export const createAgentBody = z.object({
  name: ensLabelSchema,
  /** The address the agent signs requests with. */
  authAddress: walletAddressSchema.optional(),
  /** Starting policy. Written to the ENS text records at registration. */
  policy: setPolicyBody.optional(),
});

export type CreateAgentBody = z.infer<typeof createAgentBody>;
export type SetPolicyBody = z.infer<typeof setPolicyBody>;

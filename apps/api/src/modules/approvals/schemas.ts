import { z } from "zod";

export const approvalIdParams = z.object({
  approvalId: z.uuid(),
});

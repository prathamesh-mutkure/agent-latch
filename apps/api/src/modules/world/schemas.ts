import { z } from "zod";
import { walletAddressSchema, walletAuthPayloadSchema } from "../../schemas";

export const linkBody = z.object({
  nonce: z.string().regex(/^[0-9a-zA-Z]{8,64}$/),
  agentId: z.uuid().optional(),
  payload: walletAuthPayloadSchema,
});

export const walletParams = z.object({
  wallet: walletAddressSchema,
});

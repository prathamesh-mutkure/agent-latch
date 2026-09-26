import { z } from "zod";
import { walletAuthPayloadSchema } from "../../schemas";

export const signInBody = z.object({
  nonce: z.string().regex(/^[0-9a-zA-Z]{8,64}$/),
  payload: walletAuthPayloadSchema,
});

export const pairingParams = z.object({
  code: z.string().regex(/^[A-Z2-9]{8}$/),
});

export const collectPairingBody = z.object({
  secret: z.string().regex(/^[0-9a-f]{64}$/),
});

import { actionTypes } from "@agentlatch/core";
import { z } from "zod";

export const actionTypeSchema = z.enum(actionTypes);

export const walletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 0x wallet address.");

/** `MiniKit.walletAuth` result, posted by the mini app as is. */
export const walletAuthPayloadSchema = z.object({
  address: walletAddressSchema,
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Expected a hex signature."),
});

export const decisionSchema = z.enum(["approve", "deny"]);

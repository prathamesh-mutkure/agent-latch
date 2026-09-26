import { actionTypes } from "@agentlatch/core";
import { z } from "zod";

export const actionTypeSchema = z.enum(actionTypes);

import { packageId } from "@agentlatch/core";
import { Elysia } from "elysia";

export const healthRoutes = new Elysia().get("/health", () => ({
  ok: true as const,
  service: "agentlatch-api",
  core: packageId,
}));

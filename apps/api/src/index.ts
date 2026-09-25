import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { packageId } from "@agentlatch/core";
import { Elysia } from "elysia";

const rootEnv = resolve(import.meta.dir, "../../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export const app = new Elysia().get("/health", () => ({
  ok: true as const,
  service: "agentlatch-api",
  core: packageId,
}));

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port);
  console.log(`api listening on ${app.server?.hostname}:${app.server?.port}`);
}

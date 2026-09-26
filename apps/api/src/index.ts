import "./env";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { applyMigrations } from "./db/migrate";
import { actionRoutes } from "./modules/actions/routes";
import { agentsRoutes } from "./modules/agents/routes";
import { approvalRoutes } from "./modules/approvals/routes";
import { auditRoutes } from "./modules/audit/routes";
import { healthRoutes } from "./modules/health/routes";
import { worldRoutes } from "./modules/world/routes";
import { x402Routes } from "./modules/x402/routes";

export const app = new Elysia()
  .use(cors())
  .use(healthRoutes)
  .use(worldRoutes)
  .use(agentsRoutes)
  .use(actionRoutes)
  .use(approvalRoutes)
  .use(auditRoutes)
  .use(x402Routes);

export type App = typeof app;

if (import.meta.main) {
  await applyMigrations();
  console.log("migrations applied");
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port);
  console.log(`api listening on ${app.server?.hostname}:${app.server?.port}`);
}

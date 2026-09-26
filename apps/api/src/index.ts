import "./env";
import { Elysia } from "elysia";
import { actionRoutes } from "./modules/actions/routes";
import { agentsRoutes } from "./modules/agents/routes";
import { approvalRoutes } from "./modules/approvals/routes";
import { auditRoutes } from "./modules/audit/routes";
import { healthRoutes } from "./modules/health/routes";

export const app = new Elysia()
  .use(healthRoutes)
  .use(agentsRoutes)
  .use(actionRoutes)
  .use(approvalRoutes)
  .use(auditRoutes);

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port);
  console.log(`api listening on ${app.server?.hostname}:${app.server?.port}`);
}

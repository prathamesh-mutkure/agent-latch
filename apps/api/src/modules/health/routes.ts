import { packageId } from "@agentlatch/core";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db/client";

export const healthRoutes = new Elysia().get("/health", async ({ set }) => {
  try {
    await db.execute(sql`select 1`);
    return {
      ok: true as const,
      service: "dsap-api",
      core: packageId,
      database: "up" as const,
    };
  } catch {
    set.status = 503;
    return {
      ok: false as const,
      service: "dsap-api",
      core: packageId,
      database: "down" as const,
    };
  }
});

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "../env";
import * as schema from "./schema";

const queryClient = postgres(databaseUrl, { max: 10 });

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Db = Database | Tx;

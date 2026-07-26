import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  var __temTrackerSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Serverless (Vercel) runs many short-lived instances against Supabase's
  // connection pooler. Cap each instance to a single connection and let idle
  // ones close quickly so the pool is never exhausted; `prepare: false` is
  // required for the transaction-mode pooler (port 6543).
  return postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

const client = global.__temTrackerSql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  global.__temTrackerSql = client;
}

export const db = drizzle(client, { schema });

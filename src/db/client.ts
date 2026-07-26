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
  // connection pooler. Keep a small per-instance pool so dashboard queries
  // (fired concurrently via Promise.all) still run in parallel, while idle
  // connections close quickly so the pool is never exhausted under real load.
  return postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

const client = global.__temTrackerSql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  global.__temTrackerSql = client;
}

export const db = drizzle(client, { schema });

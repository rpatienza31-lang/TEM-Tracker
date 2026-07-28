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
  // Supabase's session pooler (port 5432) caps total clients at pool_size 15
  // on the free tier. Vercel can run several function instances at once, so
  // each must hold as few connections as possible: cap the pool at 1. With the
  // function co-located with the database (same region), query latency is tiny,
  // so serializing a page's handful of queries over one connection is fast and
  // safe from "max clients reached in session mode" exhaustion. `prepare:false`
  // keeps it pooler-compatible; idle connections close quickly.
  // Production keeps a single connection per instance to stay under the free
  // tier session pooler's 15-client cap; dev/test use a larger pool so the
  // concurrency suite can exercise real parallel transactions.
  return postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Reuse a single client across warm invocations (and dev HMR) so instances
// don't accumulate connections.
const client = global.__temTrackerSql ?? createClient();
global.__temTrackerSql = client;

export const db = drizzle(client, { schema });

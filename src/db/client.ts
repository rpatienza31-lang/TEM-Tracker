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
  // A small pool per instance keeps us under the free-tier session pooler's
  // 15-client cap, while leaving headroom for a transaction (e.g. approval) to
  // run without starving the instance's other queries. With the function
  // co-located with the database, queries are fast and connections are
  // released quickly, so this stays well under the cap in practice.
  // lock_timeout makes a query that's blocked on a stuck row lock fail in 8s
  // instead of hanging until the statement timeout (~2 min).
  return postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { lock_timeout: 8000 },
  });
}

// Reuse a single client across warm invocations (and dev HMR) so instances
// don't accumulate connections.
const client = global.__temTrackerSql ?? createClient();
global.__temTrackerSql = client;

export const db = drizzle(client, { schema });

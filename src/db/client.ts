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
  // The free-tier session pooler caps total clients at 15. Vercel can run
  // several function instances at once, so production holds a single
  // connection per instance to stay well under the cap. A page's queries
  // serialize over that one connection, and a single approval transaction
  // uses it exclusively for ~tens of ms — fast, because the function is
  // co-located with the database, and safe from exhaustion. Dev/test use a
  // larger pool so the concurrency suite can run real parallel transactions.
  // No custom `connection` startup params — the pooler rejects non-whitelisted
  // ones (e.g. lock_timeout), which fails every connection.
  return postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Reuse a single client across warm invocations (and dev HMR) so instances
// don't accumulate connections.
function createDb() {
  const client = global.__temTrackerSql ?? createClient();
  global.__temTrackerSql = client;
  return drizzle(client, { schema });
}

type DbInstance = ReturnType<typeof createDb>;

// Lazily instantiate on first use rather than at import. `next build` imports
// route modules to collect page data, and that must not require DATABASE_URL —
// the connection is only ever needed at runtime, when the env is present.
let instance: DbInstance | undefined;

export const db = new Proxy({} as DbInstance, {
  get(_target, prop) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

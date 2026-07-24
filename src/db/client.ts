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
  return postgres(url, { prepare: false });
}

const client = global.__temTrackerSql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  global.__temTrackerSql = client;
}

export const db = drizzle(client, { schema });

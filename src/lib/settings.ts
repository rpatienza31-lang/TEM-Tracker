import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_QUOTA_SIZE, DEFAULT_WIP_LIMIT, DELIVERABLE_POINTS, type DeliverableType } from "@/lib/constants";

// Either the connection pool or an open transaction. Callers running inside a
// db.transaction() MUST pass their `tx`; issuing a pool query from within a
// transaction deadlocks when the pool is capped at one connection.
type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getWipLimit(reader: Reader = db): Promise<number> {
  const [row] = await reader.select().from(settings).where(eq(settings.key, "wip_limit")).limit(1);
  return typeof row?.value === "number" ? row.value : DEFAULT_WIP_LIMIT;
}

export async function getQuotaSize(reader: Reader = db): Promise<number> {
  const [row] = await reader.select().from(settings).where(eq(settings.key, "quota_size")).limit(1);
  return typeof row?.value === "number" ? row.value : DEFAULT_QUOTA_SIZE;
}

export async function getPointsTable(reader: Reader = db): Promise<Record<DeliverableType, number>> {
  const [row] = await reader.select().from(settings).where(eq(settings.key, "points")).limit(1);
  if (row?.value && typeof row.value === "object") {
    return { ...DELIVERABLE_POINTS, ...(row.value as Partial<Record<DeliverableType, number>>) };
  }
  return DELIVERABLE_POINTS;
}

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_QUOTA_SIZE, DEFAULT_WIP_LIMIT, DELIVERABLE_POINTS } from "@/lib/constants";

export async function getWipLimit(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "wip_limit")).limit(1);
  return typeof row?.value === "number" ? row.value : DEFAULT_WIP_LIMIT;
}

export async function getQuotaSize(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "quota_size")).limit(1);
  return typeof row?.value === "number" ? row.value : DEFAULT_QUOTA_SIZE;
}

export async function getPointsTable(): Promise<Record<"DLP" | "COT", number>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "points")).limit(1);
  if (row?.value && typeof row.value === "object") {
    return row.value as Record<"DLP" | "COT", number>;
  }
  return DELIVERABLE_POINTS;
}

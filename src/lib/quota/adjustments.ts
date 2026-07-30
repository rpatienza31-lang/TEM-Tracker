import { and, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { pointAdjustments } from "@/db/schema";
import { adjustPointsInCycle } from "@/lib/quota/cycles";
import type { DateRange } from "@/lib/quota/productivity";

/**
 * Records an owner's manual point correction for an editor and applies it to
 * their open quota cycle, atomically. `points` may be negative (docking) or
 * positive (bonus) but never zero. Returns the id of the cycle it landed in.
 */
export async function recordPointAdjustment(params: {
  editorId: string;
  points: number;
  note?: string | null;
  actorId?: string | null;
}): Promise<{ cycleId: string }> {
  const { editorId, points, note, actorId } = params;
  return db.transaction(async (tx) => {
    const cycleId = await adjustPointsInCycle(tx, editorId, points);
    await tx.insert(pointAdjustments).values({
      editorId,
      cycleId,
      points: points.toFixed(2),
      note: note?.trim() || null,
      createdBy: actorId ?? null,
    });
    return { cycleId };
  });
}

function dateCondition(range?: DateRange) {
  const clauses = [
    range?.from ? gte(pointAdjustments.createdAt, new Date(range.from)) : undefined,
    range?.to ? lte(pointAdjustments.createdAt, new Date(`${range.to}T23:59:59`)) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  return clauses.length ? and(...clauses) : undefined;
}

/** Net manual adjustment points per editor within the period, keyed by editor id. */
export async function getAdjustmentTotals(range?: DateRange): Promise<Map<string, number>> {
  const rows = await db
    .select({ editorId: pointAdjustments.editorId, points: sql<string>`sum(${pointAdjustments.points})` })
    .from(pointAdjustments)
    .where(dateCondition(range))
    .groupBy(pointAdjustments.editorId);
  return new Map(rows.map((r) => [r.editorId, Number(r.points)]));
}

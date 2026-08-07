import { and, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import { subjectPoints, workItems } from "@/db/schema";
import { getPointsTable } from "@/lib/settings";
import { ALL_DELIVERABLE_TYPES, type DeliverableType } from "@/lib/constants";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const key = (subjectId: string, type: DeliverableType) => `${subjectId}:${type}`;

/**
 * Per-subject point overrides as a lookup keyed by `${subjectId}:${type}`.
 * Absent keys fall back to the global points table. Optionally scoped to a set
 * of subjects, for the generator which only needs the ones it's building.
 */
export async function getSubjectPointsMap(reader: Reader = db, subjectIds?: string[]): Promise<Map<string, number>> {
  const rows = subjectIds
    ? subjectIds.length
      ? await reader.select().from(subjectPoints).where(inArray(subjectPoints.subjectId, subjectIds))
      : []
    : await reader.select().from(subjectPoints);
  return new Map(rows.map((r) => [key(r.subjectId, r.type), Number(r.points)]));
}

/** Resolves the point value for a (subject, type): the override if set, else the global default. */
export function pointsForItem(
  overrides: Map<string, number>,
  globalPoints: Record<DeliverableType, number>,
  subjectId: string,
  type: DeliverableType,
): number {
  return overrides.get(key(subjectId, type)) ?? globalPoints[type];
}

/** The point values (override or global default) for one subject, per deliverable type. */
export async function getSubjectPointsRow(subjectId: string): Promise<Record<DeliverableType, number>> {
  const [globalPoints, overrides] = await Promise.all([getPointsTable(), getSubjectPointsMap(db, [subjectId])]);
  return Object.fromEntries(
    ALL_DELIVERABLE_TYPES.map((t) => [t, pointsForItem(overrides, globalPoints, subjectId, t)]),
  ) as Record<DeliverableType, number>;
}

// Statuses whose points are already awarded into a cycle (or finalised); their
// snapshot must never be rewritten by a later override change.
const AWARDED_STATUSES: ("approved" | "uploaded" | "cancelled")[] = ["approved", "uploaded", "cancelled"];

/**
 * Sets a subject's point override for a deliverable type and re-snapshots it
 * onto that subject's not-yet-approved work items, so the live catalog reflects
 * the new value. Approved/uploaded/cancelled items keep their snapshot — their
 * points are already awarded. Runs in a transaction.
 */
export async function setSubjectPoints(subjectId: string, type: DeliverableType, points: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(subjectPoints)
      .values({ subjectId, type, points: points.toFixed(2) })
      .onConflictDoUpdate({
        target: [subjectPoints.subjectId, subjectPoints.type],
        set: { points: points.toFixed(2) },
      });

    await tx
      .update(workItems)
      .set({ pointsValue: points.toFixed(2), updatedAt: new Date() })
      .where(
        and(
          eq(workItems.subjectId, subjectId),
          eq(workItems.type, type),
          notInArray(workItems.status, AWARDED_STATUSES),
        ),
      );
  });
}

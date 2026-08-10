import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems } from "@/db/schema";
import { awardPointsForCotItem } from "@/lib/quota/cycles";
import type { AppUser } from "@/lib/auth";

// Statuses that already count as finished — never re-credited by a backfill.
const DONE_STATUSES = ["approved", "uploaded", "cancelled"] as const;

export type BackfillResult = { done: number; skipped: number };

/**
 * Bulk-marks the selected COT order items as finished and credits their points
 * to one editor — the COT counterpart of the catalog backfill, for custom orders
 * that were really done offline. Each not-yet-finished item is assigned to the
 * editor, moved to approved (or uploaded), stamped, and point-awarded into the
 * editor's quota cycle (so it shows in payroll). Already-finished items are
 * skipped so nothing is double-credited. Owner/admin only.
 */
export async function bulkBackfillCotItems(params: {
  itemIds: string[];
  editorId: string;
  markUploaded: boolean;
  actor: AppUser;
}): Promise<BackfillResult> {
  const { itemIds, editorId, markUploaded } = params;
  if (itemIds.length === 0) return { done: 0, skipped: 0 };

  return db.transaction(async (tx) => {
    const items = await tx.select().from(customOrderItems).where(inArray(customOrderItems.id, itemIds));
    const now = new Date();
    let done = 0;
    let skipped = 0;

    for (const item of items) {
      if ((DONE_STATUSES as readonly string[]).includes(item.status)) {
        skipped++;
        continue;
      }

      const points = Number(item.pointsValue);
      const cycleId = await awardPointsForCotItem(tx, editorId, points);

      await tx
        .update(customOrderItems)
        .set({
          assigneeId: editorId,
          status: markUploaded ? "uploaded" : "approved",
          claimedAt: item.claimedAt ?? now,
          submittedAt: item.submittedAt ?? now,
          approvedAt: now,
          pointsAwarded: String(points),
          awardedCycleId: cycleId,
          updatedAt: now,
        })
        .where(and(eq(customOrderItems.id, item.id), eq(customOrderItems.version, item.version)));

      done++;
    }

    return { done, skipped };
  });
}

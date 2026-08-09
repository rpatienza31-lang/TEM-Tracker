import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems, workItemEvents } from "@/db/schema";
import { awardPointsForApproval } from "@/lib/quota/cycles";
import type { AppUser } from "@/lib/auth";

// Statuses that already count as finished — never re-credited by a backfill.
const DONE_STATUSES = ["approved", "uploaded", "cancelled"] as const;

export type BackfillResult = { done: number; skipped: number };

/**
 * Bulk-marks catalog work items as finished and credits their points to one
 * editor — a fast catch-up for overdue items that were really done offline.
 * Runs in a transaction: each not-yet-finished item is assigned to the editor,
 * moved to approved (or uploaded), stamped, point-awarded into the editor's
 * quota cycle (so it shows in the payroll breakdown), and event-logged. Items
 * already finished are skipped so nothing is double-credited. Owner/admin only.
 */
export async function bulkBackfillWorkItems(params: {
  itemIds: string[];
  editorId: string;
  markUploaded: boolean;
  actor: AppUser;
}): Promise<BackfillResult> {
  const { itemIds, editorId, markUploaded, actor } = params;
  if (itemIds.length === 0) return { done: 0, skipped: 0 };

  return db.transaction(async (tx) => {
    const items = await tx.select().from(workItems).where(inArray(workItems.id, itemIds));
    const now = new Date();
    let done = 0;
    let skipped = 0;

    for (const item of items) {
      if ((DONE_STATUSES as readonly string[]).includes(item.status)) {
        skipped++;
        continue;
      }

      const points = Number(item.pointsValue);
      await tx
        .update(workItems)
        .set({
          assigneeId: editorId,
          status: markUploaded ? "uploaded" : "approved",
          claimedAt: item.claimedAt ?? now,
          submittedAt: item.submittedAt ?? now,
          approvedAt: now,
          uploadedAt: markUploaded ? now : item.uploadedAt,
          pointsAwarded: item.pointsValue,
          updatedAt: now,
        })
        .where(and(eq(workItems.id, item.id), eq(workItems.version, item.version)));

      await awardPointsForApproval(tx, editorId, item.id, points);
      await tx.insert(workItemEvents).values({
        workItemId: item.id,
        actorId: actor.id,
        fromStatus: item.status,
        toStatus: markUploaded ? "uploaded" : "approved",
        note: "Backfilled",
      });
      done++;
    }

    return { done, skipped };
  });
}

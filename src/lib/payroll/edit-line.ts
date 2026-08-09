import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, pointAdjustments, quotaCycleItems, workItems } from "@/db/schema";
import { applyDeltaToCycle, reverseApprovalPoints, reverseCotItemPoints } from "@/lib/quota/cycles";

export type LineKind = "catalog" | "cot" | "adjustment";
export type EditLineResult = { ok: boolean; message?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Edits the point value of an already-counted breakdown line and keeps the
 * cycle it landed in consistent (adjusting closures as needed). The line's own
 * source row is updated in place, so payroll and productivity — which sum those
 * rows — reflect the new value directly, with no offsetting entry. Owner-gated
 * at the action layer, since points feed salary.
 */
export async function editLinePoints(params: {
  kind: LineKind;
  refId: string;
  newPoints: number;
}): Promise<EditLineResult> {
  const { kind, refId, newPoints } = params;

  if (!Number.isFinite(newPoints)) return { ok: false, message: "Enter a valid point value." };
  if (kind !== "adjustment" && newPoints < 0) {
    return { ok: false, message: "A project's points can't be negative." };
  }
  const value = round2(newPoints);

  return db.transaction(async (tx): Promise<EditLineResult> => {
    if (kind === "catalog") {
      const [row] = await tx
        .select()
        .from(quotaCycleItems)
        .where(eq(quotaCycleItems.workItemId, refId))
        .limit(1);
      if (!row) return { ok: false, message: "Project not found." };
      const delta = round2(value - Number(row.points));
      await tx.update(quotaCycleItems).set({ points: value.toFixed(2) }).where(eq(quotaCycleItems.workItemId, refId));
      await tx
        .update(workItems)
        .set({ pointsAwarded: value.toFixed(2), updatedAt: new Date() })
        .where(eq(workItems.id, refId));
      await applyDeltaToCycle(tx, row.cycleId, delta);
      return { ok: true };
    }

    if (kind === "cot") {
      const [item] = await tx.select().from(customOrderItems).where(eq(customOrderItems.id, refId)).limit(1);
      if (!item) return { ok: false, message: "Project not found." };
      const delta = round2(value - Number(item.pointsAwarded ?? 0));
      await tx
        .update(customOrderItems)
        .set({ pointsAwarded: value.toFixed(2), updatedAt: new Date() })
        .where(eq(customOrderItems.id, refId));
      if (item.awardedCycleId) await applyDeltaToCycle(tx, item.awardedCycleId, delta);
      return { ok: true };
    }

    const [adj] = await tx.select().from(pointAdjustments).where(eq(pointAdjustments.id, refId)).limit(1);
    if (!adj) return { ok: false, message: "Adjustment not found." };
    const delta = round2(value - Number(adj.points));
    await tx.update(pointAdjustments).set({ points: value.toFixed(2) }).where(eq(pointAdjustments.id, refId));
    if (adj.cycleId) await applyDeltaToCycle(tx, adj.cycleId, delta);
    return { ok: true };
  });
}

/**
 * Truly removes a breakdown line: reverses its points from the cycle and drops
 * the source so it disappears from the breakdown — a catalog credit's ledger row
 * (and its work item's awarded points), a COT item's award, or a manual
 * adjustment row. Owner-gated at the action layer.
 */
export async function removeLine(params: { kind: LineKind; refId: string }): Promise<EditLineResult> {
  const { kind, refId } = params;

  return db.transaction(async (tx): Promise<EditLineResult> => {
    if (kind === "catalog") {
      const [row] = await tx.select().from(quotaCycleItems).where(eq(quotaCycleItems.workItemId, refId)).limit(1);
      if (!row) return { ok: false, message: "Project not found." };
      await reverseApprovalPoints(tx, refId); // deletes the ledger row + reverses the cycle
      await tx.update(workItems).set({ pointsAwarded: null, updatedAt: new Date() }).where(eq(workItems.id, refId));
      return { ok: true };
    }

    if (kind === "cot") {
      const [item] = await tx.select().from(customOrderItems).where(eq(customOrderItems.id, refId)).limit(1);
      if (!item) return { ok: false, message: "Project not found." };
      if (item.awardedCycleId && item.pointsAwarded) {
        await reverseCotItemPoints(tx, item.awardedCycleId, Number(item.pointsAwarded));
      }
      await tx
        .update(customOrderItems)
        .set({ pointsAwarded: null, awardedCycleId: null, updatedAt: new Date() })
        .where(eq(customOrderItems.id, refId));
      return { ok: true };
    }

    const [adj] = await tx.select().from(pointAdjustments).where(eq(pointAdjustments.id, refId)).limit(1);
    if (!adj) return { ok: false, message: "Adjustment not found." };
    if (adj.cycleId) await applyDeltaToCycle(tx, adj.cycleId, -Number(adj.points));
    await tx.delete(pointAdjustments).where(eq(pointAdjustments.id, refId));
    return { ok: true };
  });
}

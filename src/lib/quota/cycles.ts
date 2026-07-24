import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { quotaCycles, quotaCycleItems } from "@/db/schema";
import { getQuotaSize } from "@/lib/settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QuotaCycle = typeof quotaCycles.$inferSelect;

async function getOrCreateOpenCycle(tx: Tx, editorId: string, quotaSize: number): Promise<QuotaCycle> {
  const [open] = await tx
    .select()
    .from(quotaCycles)
    .where(and(eq(quotaCycles.editorId, editorId), eq(quotaCycles.isClosed, false)))
    .orderBy(desc(quotaCycles.cycleNumber))
    .limit(1);
  if (open) return open;

  const [latest] = await tx
    .select()
    .from(quotaCycles)
    .where(eq(quotaCycles.editorId, editorId))
    .orderBy(desc(quotaCycles.cycleNumber))
    .limit(1);

  const [created] = await tx
    .insert(quotaCycles)
    .values({
      editorId,
      cycleNumber: (latest?.cycleNumber ?? 0) + 1,
      targetPoints: String(quotaSize),
      pointsTotal: "0",
      carriedIn: "0",
    })
    .returning();
  return created;
}

async function findCycleByNumber(tx: Tx, editorId: string, cycleNumber: number) {
  const [cycle] = await tx
    .select()
    .from(quotaCycles)
    .where(and(eq(quotaCycles.editorId, editorId), eq(quotaCycles.cycleNumber, cycleNumber)))
    .limit(1);
  return cycle;
}

/**
 * Records an approval's points against the assignee's open quota cycle
 * (spec §6.4). Closes the cycle and opens the next one, carrying any
 * overflow forward, when the target is crossed. Runs inside the caller's
 * transaction so the status change, event log, and point award are atomic.
 */
export async function awardPointsForApproval(tx: Tx, editorId: string, workItemId: string, points: number) {
  const quotaSize = await getQuotaSize();
  const cycle = await getOrCreateOpenCycle(tx, editorId, quotaSize);

  await tx.insert(quotaCycleItems).values({ cycleId: cycle.id, workItemId, points: String(points) });

  const target = Number(cycle.targetPoints);
  const newTotal = Number(cycle.pointsTotal) + points;

  if (newTotal >= target) {
    const carriedIn = newTotal - target;
    await tx
      .update(quotaCycles)
      .set({ pointsTotal: String(newTotal), isClosed: true, closedAt: new Date() })
      .where(eq(quotaCycles.id, cycle.id));
    await tx.insert(quotaCycles).values({
      editorId,
      cycleNumber: cycle.cycleNumber + 1,
      targetPoints: String(quotaSize),
      pointsTotal: String(carriedIn),
      carriedIn: String(carriedIn),
    });
  } else {
    await tx.update(quotaCycles).set({ pointsTotal: String(newTotal) }).where(eq(quotaCycles.id, cycle.id));
  }
}

/**
 * Removes `pointsToRemove` from a cycle's total. If the cycle was closed and
 * no longer meets its target afterward, reopens it and cascades the removal
 * of what it had carried forward into the next cycle (recursively, in case
 * that cycle had also closed).
 */
async function reverseFromCycle(tx: Tx, cycleId: string, pointsToRemove: number) {
  const [cycle] = await tx.select().from(quotaCycles).where(eq(quotaCycles.id, cycleId)).limit(1);
  if (!cycle) return;

  const target = Number(cycle.targetPoints);
  const oldTotal = Number(cycle.pointsTotal);
  const newTotal = oldTotal - pointsToRemove;

  if (!cycle.isClosed) {
    await tx.update(quotaCycles).set({ pointsTotal: String(newTotal) }).where(eq(quotaCycles.id, cycleId));
    return;
  }

  if (newTotal >= target) {
    // Still crosses the target after removal — stays closed, but the
    // overflow carried into the next cycle shrinks by the same amount.
    await tx.update(quotaCycles).set({ pointsTotal: String(newTotal) }).where(eq(quotaCycles.id, cycleId));
    const nextCycle = await findCycleByNumber(tx, cycle.editorId, cycle.cycleNumber + 1);
    if (nextCycle) await reverseFromCycle(tx, nextCycle.id, pointsToRemove);
    return;
  }

  // No longer meets target — reopen this cycle and roll back what it had
  // carried into the next one.
  const oldCarry = oldTotal - target;
  await tx
    .update(quotaCycles)
    .set({ pointsTotal: String(newTotal), isClosed: false, closedAt: null })
    .where(eq(quotaCycles.id, cycleId));

  const nextCycle = await findCycleByNumber(tx, cycle.editorId, cycle.cycleNumber + 1);
  if (nextCycle) await reverseFromCycle(tx, nextCycle.id, oldCarry);
}

/**
 * Undoes a previously-awarded approval (un-approve or release of an
 * approved/uploaded item, spec §6.4 "Reversal"). No-ops if the item was
 * never awarded points.
 */
export async function reverseApprovalPoints(tx: Tx, workItemId: string) {
  const [row] = await tx.select().from(quotaCycleItems).where(eq(quotaCycleItems.workItemId, workItemId)).limit(1);
  if (!row) return;

  await tx.delete(quotaCycleItems).where(eq(quotaCycleItems.workItemId, workItemId));
  await reverseFromCycle(tx, row.cycleId, Number(row.points));
}

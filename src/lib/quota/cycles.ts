import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

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
/**
 * Applies `points` to the editor's open quota cycle, rolling the cycle over
 * (close + open next, carrying overflow) when the target is crossed. Returns
 * the id of the cycle the points were recorded against, so a later reversal
 * can target it. Shared by catalog work items and COT order items.
 */
async function applyPointsToCycle(tx: Tx, editorId: string, points: number): Promise<string> {
  const quotaSize = await getQuotaSize(tx);
  const cycle = await getOrCreateOpenCycle(tx, editorId, quotaSize);

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

  return cycle.id;
}

/**
 * Records an approval's points against the assignee's open quota cycle
 * (spec §6.4). Runs inside the caller's transaction so the status change,
 * event log, and point award are atomic.
 */
export async function awardPointsForApproval(tx: Tx, editorId: string, workItemId: string, points: number) {
  const cycleId = await applyPointsToCycle(tx, editorId, points);
  await tx.insert(quotaCycleItems).values({ cycleId, workItemId, points: String(points) });
}

/**
 * Awards a COT order item's points into the same quota cycle as regular work,
 * returning the cycle id to store on the item for later reversal. COT items
 * are not catalog work items, so they don't use the quota_cycle_items ledger.
 */
export async function awardPointsForCotItem(tx: Tx, editorId: string, points: number): Promise<string> {
  return applyPointsToCycle(tx, editorId, points);
}

/** Reverses a COT item's previously-awarded points from the cycle they landed in. */
export async function reverseCotItemPoints(tx: Tx, cycleId: string, points: number) {
  await reverseFromCycle(tx, cycleId, points);
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

export type EditorCycleClosures = { editorId: string; cyclesCompleted: number; remainderCarried: number };

/**
 * Cycles that closed within [from, to], per editor — the payroll report's
 * "cycles completed in the period" and "remainder carried" columns
 * (spec §9 Phase 3). Reconciles with the Productivity screen because both
 * read the same quota_cycles/quota_cycle_items rows.
 */
export async function getCyclesClosedInPeriod(from: string, to: string): Promise<EditorCycleClosures[]> {
  // The overflow a closed cycle pushed forward is (points_total - target), not
  // its own carried_in column — that column holds what *it* received when it
  // was opened, not what it produced on closing.
  const rows = await db
    .select({
      editorId: quotaCycles.editorId,
      cyclesCompleted: sql<number>`count(*)::int`,
      remainderCarried: sql<string>`sum(${quotaCycles.pointsTotal} - ${quotaCycles.targetPoints})`,
    })
    .from(quotaCycles)
    .where(
      and(
        eq(quotaCycles.isClosed, true),
        gte(quotaCycles.closedAt, new Date(from)),
        lte(quotaCycles.closedAt, new Date(`${to}T23:59:59`)),
      ),
    )
    .groupBy(quotaCycles.editorId);

  return rows.map((r) => ({ editorId: r.editorId, cyclesCompleted: r.cyclesCompleted, remainderCarried: Number(r.remainderCarried) }));
}

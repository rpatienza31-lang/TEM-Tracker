import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, quotaCycles, quotaCycleItems, users, workItems } from "@/db/schema";
import { getQuotaSize } from "@/lib/settings";
import { getAdjustmentTotals } from "@/lib/quota/adjustments";
import { getPaymentTotals } from "@/lib/payroll/payments";
import { ALL_DELIVERABLE_TYPES, type DeliverableType } from "@/lib/constants";

export type DateRange = { from?: string; to?: string };

export type EditorProductivity = {
  editorId: string;
  fullName: string;
  cycleNumber: number;
  pointsTotal: number;
  targetPoints: number;
  completedCycles: number;
  totalPoints: number;
  // Lifetime points already paid out (the payment watermark), and the unpaid
  // balance still owed: totalPoints − pointsPaid.
  pointsPaid: number;
  pointsUnpaid: number;
  lastPaidAt: string | null;
  // Current cycle shown across the app, derived from the ledger + payments so it
  // can't drift. ledgerCycleNumber is which payout cycle they're building
  // (floor(pointsPaid / quota) + 1); ledgerCyclePoints is the UNPAID progress
  // into it — the same number payroll shows.
  ledgerCycleNumber: number;
  ledgerCyclePoints: number;
  adjustments: number;
  pointsByType: Record<DeliverableType, number>;
  avgTurnaroundHours: number | null;
  revisionRate: number | null;
};

function dateCondition(column: Parameters<typeof gte>[0], range?: DateRange) {
  const clauses = [
    range?.from ? gte(column, new Date(range.from)) : undefined,
    range?.to ? lte(column, new Date(`${range.to}T23:59:59`)) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  return clauses.length ? and(...clauses) : undefined;
}

export async function getProductivityStats(range?: DateRange): Promise<EditorProductivity[]> {
  const quotaSize = await getQuotaSize();

  // Quota staff = anyone paid via quota (payType quota or both), regardless of
  // role — so an admin who also does quota work (e.g. payType "both") still
  // shows on the Productivity and Payroll quota tables.
  const editors = await db
    .select({ id: users.id, fullName: users.fullName, cycleOffset: users.cycleOffset })
    .from(users)
    .where(inArray(users.payType, ["quota", "both"]))
    .orderBy(asc(users.fullName));

  const [openCycles, completedCounts, breakdown, cotBreakdown, turnaround, revision, adjustmentTotals, paymentTotals] = await Promise.all([
    db.select().from(quotaCycles).where(eq(quotaCycles.isClosed, false)),
    db
      .select({ editorId: quotaCycles.editorId, count: sql<number>`count(*)::int` })
      .from(quotaCycles)
      .where(eq(quotaCycles.isClosed, true))
      .groupBy(quotaCycles.editorId),
    db
      .select({
        editorId: quotaCycles.editorId,
        type: workItems.type,
        points: sql<string>`sum(${quotaCycleItems.points})`,
      })
      .from(quotaCycleItems)
      .innerJoin(quotaCycles, eq(quotaCycles.id, quotaCycleItems.cycleId))
      .innerJoin(workItems, eq(workItems.id, quotaCycleItems.workItemId))
      .where(dateCondition(quotaCycleItems.awardedAt, range))
      .groupBy(quotaCycles.editorId, workItems.type),
    // COT approvals live in custom_order_items, not the quota_cycle_items
    // ledger, so their points must be summed separately or they'd never show
    // up in an editor's period points total.
    db
      .select({
        editorId: customOrderItems.assigneeId,
        type: customOrderItems.type,
        points: sql<string>`sum(${customOrderItems.pointsAwarded})`,
      })
      .from(customOrderItems)
      .where(
        and(
          eq(customOrderItems.status, "approved"),
          isNotNull(customOrderItems.assigneeId),
          dateCondition(customOrderItems.approvedAt, range),
        ),
      )
      .groupBy(customOrderItems.assigneeId, customOrderItems.type),
    db
      .select({
        editorId: workItems.assigneeId,
        avgSeconds: sql<string>`avg(extract(epoch from (${workItems.approvedAt} - ${workItems.claimedAt})))`,
      })
      .from(workItems)
      .where(
        and(
          isNotNull(workItems.approvedAt),
          isNotNull(workItems.claimedAt),
          isNotNull(workItems.assigneeId),
          dateCondition(workItems.approvedAt, range),
        ),
      )
      .groupBy(workItems.assigneeId),
    db
      .select({
        editorId: workItems.assigneeId,
        submitted: sql<number>`count(*) filter (where ${workItems.submittedAt} is not null)::int`,
        revised: sql<number>`count(*) filter (where ${workItems.revisionCount} > 0)::int`,
      })
      .from(workItems)
      .where(and(isNotNull(workItems.assigneeId), dateCondition(workItems.submittedAt, range)))
      .groupBy(workItems.assigneeId),
    getAdjustmentTotals(range),
    getPaymentTotals(),
  ]);

  const openCycleByEditor = new Map(openCycles.map((c) => [c.editorId, c]));
  const completedByEditor = new Map(completedCounts.map((c) => [c.editorId, c.count]));
  const turnaroundByEditor = new Map(turnaround.map((t) => [t.editorId, t.avgSeconds]));
  const revisionByEditor = new Map(revision.map((r) => [r.editorId, r]));

  function emptyBreakdown(): Record<DeliverableType, number> {
    return Object.fromEntries(ALL_DELIVERABLE_TYPES.map((t) => [t, 0])) as Record<DeliverableType, number>;
  }

  const breakdownByEditor = new Map<string, Record<DeliverableType, number>>();
  for (const row of breakdown) {
    const entry = breakdownByEditor.get(row.editorId) ?? emptyBreakdown();
    entry[row.type] += Number(row.points);
    breakdownByEditor.set(row.editorId, entry);
  }
  for (const row of cotBreakdown) {
    if (!row.editorId) continue;
    const entry = breakdownByEditor.get(row.editorId) ?? emptyBreakdown();
    entry[row.type] += Number(row.points);
    breakdownByEditor.set(row.editorId, entry);
  }

  return editors.map((editor): EditorProductivity => {
    const open = openCycleByEditor.get(editor.id);
    const pointsByType = breakdownByEditor.get(editor.id) ?? emptyBreakdown();
    const rev = revisionByEditor.get(editor.id);
    const avgSeconds = turnaroundByEditor.get(editor.id);
    const adjustments = adjustmentTotals.get(editor.id) ?? 0;
    const totalPoints = Object.values(pointsByType).reduce((sum, p) => sum + p, 0) + adjustments;
    const paid = paymentTotals.get(editor.id);
    const pointsPaid = paid?.pointsPaid ?? 0;
    const pointsUnpaid = Math.round(Math.max(0, totalPoints - pointsPaid) * 100) / 100;
    // Which payout cycle they're building (from paid points, plus the owner's
    // reconciliation baseline), and the unpaid progress into it — the same
    // figure payroll shows.
    const ledgerCycleNumber = (quotaSize > 0 ? Math.floor(pointsPaid / quotaSize) + 1 : 1) + (editor.cycleOffset ?? 0);
    const ledgerCyclePoints = pointsUnpaid;

    return {
      editorId: editor.id,
      fullName: editor.fullName,
      cycleNumber: open?.cycleNumber ?? 1,
      pointsTotal: Number(open?.pointsTotal ?? 0),
      targetPoints: Number(open?.targetPoints ?? quotaSize),
      completedCycles: completedByEditor.get(editor.id) ?? 0,
      totalPoints,
      pointsPaid,
      pointsUnpaid,
      lastPaidAt: paid?.lastPaidAt ? new Date(paid.lastPaidAt).toISOString() : null,
      ledgerCycleNumber,
      ledgerCyclePoints,
      adjustments,
      pointsByType,
      avgTurnaroundHours: avgSeconds ? Number(avgSeconds) / 3600 : null,
      revisionRate: rev && rev.submitted > 0 ? rev.revised / rev.submitted : null,
    };
  });
}

export type ProductivitySort = "name" | "cycle" | "completed" | "points" | "turnaround" | "revision";

export function sortProductivity(rows: EditorProductivity[], sort: ProductivitySort, dir: "asc" | "desc") {
  const factor = dir === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "name":
        return factor * a.fullName.localeCompare(b.fullName);
      case "cycle":
        return factor * (a.pointsTotal / a.targetPoints - b.pointsTotal / b.targetPoints);
      case "completed":
        return factor * (a.completedCycles - b.completedCycles);
      case "points":
        return factor * (a.totalPoints - b.totalPoints);
      case "turnaround":
        return factor * ((a.avgTurnaroundHours ?? -1) - (b.avgTurnaroundHours ?? -1));
      case "revision":
        return factor * ((a.revisionRate ?? -1) - (b.revisionRate ?? -1));
      default:
        return 0;
    }
  });
  return sorted;
}

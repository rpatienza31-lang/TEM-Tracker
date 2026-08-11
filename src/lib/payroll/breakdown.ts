import { and, eq, gte, isNotNull, lte } from "drizzle-orm";

import { db } from "@/db/client";
import {
  customOrderItems,
  customOrders,
  pointAdjustments,
  quotaCycles,
  quotaCycleItems,
  subjects,
  terms,
  workItems,
} from "@/db/schema";
import type { DeliverableType } from "@/lib/constants";

/**
 * One line behind an editor's "points earned" for a period: a catalog approval,
 * a COT approval, or a manual owner adjustment. `points` can be negative (a
 * docking adjustment). `dateIso` is the moment the points landed.
 */
export type PointLine = {
  kind: "catalog" | "cot" | "adjustment";
  // The source row's id, so the owner can edit this exact line's points:
  // work item id (catalog), custom order item id (cot), or adjustment id.
  refId: string;
  type: DeliverableType | null;
  title: string;
  subtitle: string | null;
  points: number;
  dateIso: string;
};

const between = (col: Parameters<typeof gte>[0], from: string, to: string) =>
  and(gte(col, new Date(from)), lte(col, new Date(`${to}T23:59:59`)));

/**
 * The itemized projects (and adjustments) making up each editor's points in
 * [from, to], keyed by editor id. Uses the same source rows and date fields as
 * the payroll/productivity totals, so the lines sum to the "points earned"
 * figure. Lines are newest-first.
 */
export async function getPointsBreakdown(from: string, to: string): Promise<Map<string, PointLine[]>> {
  const [catalog, cot, adjustments] = await Promise.all([
    db
      .select({
        editorId: quotaCycles.editorId,
        refId: quotaCycleItems.workItemId,
        type: workItems.type,
        grade: workItems.grade,
        subjectName: subjects.name,
        termName: terms.name,
        weekNumber: workItems.weekNumber,
        points: quotaCycleItems.points,
        at: quotaCycleItems.awardedAt,
      })
      .from(quotaCycleItems)
      .innerJoin(quotaCycles, eq(quotaCycles.id, quotaCycleItems.cycleId))
      .innerJoin(workItems, eq(workItems.id, quotaCycleItems.workItemId))
      .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
      .innerJoin(terms, eq(terms.id, workItems.termId))
      .where(between(quotaCycleItems.awardedAt, from, to)),
    db
      .select({
        editorId: customOrderItems.assigneeId,
        refId: customOrderItems.id,
        type: customOrderItems.type,
        customerName: customOrders.customerName,
        subjectName: customOrders.subjectName,
        topic: customOrders.topic,
        points: customOrderItems.pointsAwarded,
        at: customOrderItems.approvedAt,
      })
      .from(customOrderItems)
      .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
      .where(
        and(
          eq(customOrderItems.status, "approved"),
          isNotNull(customOrderItems.assigneeId),
          isNotNull(customOrderItems.pointsAwarded), // a removed COT credit drops out
          between(customOrderItems.approvedAt, from, to),
        ),
      ),
    db
      .select({
        editorId: pointAdjustments.editorId,
        refId: pointAdjustments.id,
        points: pointAdjustments.points,
        note: pointAdjustments.note,
        at: pointAdjustments.createdAt,
      })
      .from(pointAdjustments)
      .where(between(pointAdjustments.createdAt, from, to)),
  ]);

  const byEditor = new Map<string, PointLine[]>();
  const push = (editorId: string | null, line: PointLine) => {
    if (!editorId) return;
    const list = byEditor.get(editorId) ?? [];
    list.push(line);
    byEditor.set(editorId, list);
  };

  for (const r of catalog) {
    push(r.editorId, {
      kind: "catalog",
      refId: r.refId,
      type: r.type,
      title: r.type,
      subtitle: `${r.termName} · Grade ${r.grade} · ${r.subjectName} · Week ${r.weekNumber}`,
      points: Number(r.points),
      dateIso: (r.at as Date).toISOString(),
    });
  }
  for (const r of cot) {
    const parts = [r.customerName, r.subjectName, r.topic].filter(Boolean);
    push(r.editorId, {
      kind: "cot",
      refId: r.refId,
      type: r.type,
      title: r.type,
      subtitle: parts.length ? parts.join(" · ") : null,
      points: Number(r.points ?? 0),
      dateIso: (r.at as Date).toISOString(),
    });
  }
  for (const r of adjustments) {
    push(r.editorId, {
      kind: "adjustment",
      refId: r.refId,
      type: null,
      title: "Manual adjustment",
      subtitle: r.note,
      points: Number(r.points),
      dateIso: (r.at as Date).toISOString(),
    });
  }

  for (const list of byEditor.values()) {
    list.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }
  return byEditor;
}

import { aliasedTable, and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrders, customOrderItems, terms, users } from "@/db/schema";
import { priorityFor, type PriorityLevel } from "@/lib/cot/deadline";
import type { DeliverableType, ItemStatus } from "@/lib/constants";

export type MyCotItem = {
  id: string;
  type: DeliverableType;
  status: ItemStatus;
  customerName: string;
  subjectName: string | null;
  topic: string | null;
  lessonFor: string | null;
  deadline: string;
  orderType: "rush" | "regular";
};

export type CotReviewItem = {
  id: string;
  type: DeliverableType;
  customerName: string;
  subjectName: string | null;
  topic: string | null;
  lessonFor: string | null;
  deadline: string;
  assigneeName: string | null;
  fileUrl: string | null;
};

/** Submitted COT deliverables awaiting admin review, soonest deadline first. */
export async function getCotItemsInReview(): Promise<CotReviewItem[]> {
  const assignee = aliasedTable(users, "assignee");
  return db
    .select({
      id: customOrderItems.id,
      type: customOrderItems.type,
      customerName: customOrders.customerName,
      subjectName: customOrders.subjectName,
      topic: customOrders.topic,
      lessonFor: customOrders.lessonFor,
      deadline: customOrders.deadline,
      assigneeName: assignee.fullName,
      fileUrl: customOrderItems.fileUrl,
    })
    .from(customOrderItems)
    .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
    .leftJoin(assignee, eq(assignee.id, customOrderItems.assigneeId))
    .where(eq(customOrderItems.status, "in_review"))
    .orderBy(asc(customOrders.deadline));
}

/** COT deliverables sent back for revision (back jobs). */
export async function getCotItemsInRevision(): Promise<CotReviewItem[]> {
  const assignee = aliasedTable(users, "assignee");
  return db
    .select({
      id: customOrderItems.id,
      type: customOrderItems.type,
      customerName: customOrders.customerName,
      subjectName: customOrders.subjectName,
      topic: customOrders.topic,
      lessonFor: customOrders.lessonFor,
      deadline: customOrders.deadline,
      assigneeName: assignee.fullName,
      fileUrl: customOrderItems.fileUrl,
    })
    .from(customOrderItems)
    .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
    .leftJoin(assignee, eq(assignee.id, customOrderItems.assigneeId))
    .where(eq(customOrderItems.status, "revision"))
    .orderBy(asc(customOrders.deadline));
}

/** COT deliverables assigned to a user, filtered by status, soonest deadline first. */
export async function getMyCotItems(userId: string, statuses: ItemStatus[]): Promise<MyCotItem[]> {
  if (statuses.length === 0) return [];
  const rows = await db
    .select({
      id: customOrderItems.id,
      type: customOrderItems.type,
      status: customOrderItems.status,
      customerName: customOrders.customerName,
      subjectName: customOrders.subjectName,
      topic: customOrders.topic,
      lessonFor: customOrders.lessonFor,
      deadline: customOrders.deadline,
      orderType: customOrders.orderType,
    })
    .from(customOrderItems)
    .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
    .where(and(eq(customOrderItems.assigneeId, userId), inArray(customOrderItems.status, statuses)))
    .orderBy(asc(customOrders.deadline));
  return rows;
}

export type CotItemView = {
  id: string;
  type: "DLP" | "PPT" | "COT_DLP" | "COT_PPT";
  status: string;
  assigneeName: string | null;
  fileUrl: string | null;
  scheduledFor: string | null;
};

export type CotOrderView = {
  id: string;
  customerName: string;
  grade: number | null;
  subjectName: string | null;
  topic: string | null;
  competency: string | null;
  indicator: string | null;
  lessonFor: string | null;
  notes: string | null;
  payment: string | null;
  orderType: "rush" | "regular";
  workKind: "new" | "align";
  orderDate: string;
  deadline: string;
  priority: PriorityLevel;
  daysLeft: number;
  completed: boolean;
  items: CotItemView[];
};

async function loadOrders(orderRows: (typeof customOrders.$inferSelect)[]): Promise<CotOrderView[]> {
  if (orderRows.length === 0) return [];

  const assignee = aliasedTable(users, "assignee");
  const itemRows = await db
    .select({
      id: customOrderItems.id,
      orderId: customOrderItems.orderId,
      type: customOrderItems.type,
      status: customOrderItems.status,
      fileUrl: customOrderItems.fileUrl,
      assigneeName: assignee.fullName,
      scheduledFor: customOrderItems.scheduledFor,
    })
    .from(customOrderItems)
    .leftJoin(assignee, eq(assignee.id, customOrderItems.assigneeId))
    .where(inArray(customOrderItems.orderId, orderRows.map((o) => o.id)));

  const itemsByOrder = new Map<string, CotItemView[]>();
  for (const it of itemRows) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push({
      id: it.id,
      type: it.type,
      status: it.status,
      assigneeName: it.assigneeName ?? null,
      fileUrl: it.fileUrl,
      scheduledFor: it.scheduledFor,
    });
    itemsByOrder.set(it.orderId, list);
  }

  return orderRows.map((o) => {
    const items = (itemsByOrder.get(o.id) ?? []).sort((a, b) => a.type.localeCompare(b.type));
    const { level, daysLeft } = priorityFor(o.deadline);
    return {
      id: o.id,
      customerName: o.customerName,
      grade: o.grade,
      subjectName: o.subjectName,
      topic: o.topic,
      competency: o.competency,
      indicator: o.indicator,
      lessonFor: o.lessonFor,
      notes: o.notes,
      payment: o.payment,
      orderType: o.orderType,
      workKind: o.workKind,
      orderDate: o.orderDate,
      deadline: o.deadline,
      priority: level,
      daysLeft,
      completed: items.length > 0 && items.every((i) => i.status === "approved"),
      items,
    };
  });
}

/** Active COT orders (at least one deliverable not yet approved), soonest deadline first. */
export async function getActiveCotOrders(): Promise<CotOrderView[]> {
  const rows = await db.select().from(customOrders).orderBy(asc(customOrders.deadline));
  const all = await loadOrders(rows);
  return all.filter((o) => !o.completed);
}

export type CotBackfillCandidate = {
  id: string;
  customerName: string;
  subjectName: string | null;
  topic: string | null;
  type: DeliverableType;
  status: ItemStatus;
  deadline: string;
  pointsValue: string;
  assigneeName: string | null;
};

/**
 * Not-yet-finished COT order items — the candidates for a COT bulk backfill.
 * Excludes approved/uploaded/cancelled so already-done custom work is never
 * offered for re-crediting. Soonest deadline first.
 */
export async function getCotBackfillCandidates(): Promise<CotBackfillCandidate[]> {
  const rows = await db
    .select({
      id: customOrderItems.id,
      customerName: customOrders.customerName,
      subjectName: customOrders.subjectName,
      topic: customOrders.topic,
      type: customOrderItems.type,
      status: customOrderItems.status,
      deadline: customOrders.deadline,
      pointsValue: customOrderItems.pointsValue,
      assigneeName: users.fullName,
    })
    .from(customOrderItems)
    .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
    .leftJoin(users, eq(users.id, customOrderItems.assigneeId))
    .where(inArray(customOrderItems.status, ["available", "claimed", "in_review", "revision"]))
    .orderBy(asc(customOrders.deadline), asc(customOrders.customerName));
  return rows as CotBackfillCandidate[];
}

/** A completed COT order tagged with the term its order date falls within. */
export type CotLibraryOrder = CotOrderView & { termName: string; termSortKey: string };

/**
 * Completed COT orders — the available library of finished topics/indicators.
 * Each order is tagged with the school term whose date range contains its
 * order date, so the library can be grouped per term (and then per grade).
 */
export async function getCotLibrary(): Promise<CotLibraryOrder[]> {
  const rows = await db.select().from(customOrders).orderBy(asc(customOrders.grade), asc(customOrders.subjectName));
  const all = await loadOrders(rows);
  const completed = all.filter((o) => o.completed);

  const termRows = await db.select().from(terms).orderBy(asc(terms.startDate), asc(terms.name));

  return completed.map((o) => {
    // Date columns come back as "YYYY-MM-DD" strings, so lexical comparison is
    // chronological. Prefer a closed [start, end] window; fall back to an
    // open-ended term that has only a start date.
    const term =
      termRows.find((t) => t.startDate && t.endDate && o.orderDate >= t.startDate && o.orderDate <= t.endDate) ??
      termRows.find((t) => t.startDate && !t.endDate && o.orderDate >= t.startDate);
    return {
      ...o,
      termName: term ? `${term.name} · ${term.schoolYear}` : "Unscheduled",
      termSortKey: term?.startDate ?? "9999-12-31",
    };
  });
}

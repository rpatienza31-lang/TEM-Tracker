import { and, asc, eq, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import { customOrderItems, customOrders, staffAvailability, workItems, subjects, users, terms, termOfferings } from "@/db/schema";
import type { DeliverableType, ItemStatus } from "@/lib/constants";

export type AvailabilityKind = "day_off" | "vacation" | "school" | "absent";

export type StaffAvailability = {
  editorId: string;
  editorName: string;
  date: string;
  kind: AvailabilityKind;
  note: string | null;
};

/** Staff non-working days (day off / vacation / school / absent) in [from, to]. */
export async function getStaffAvailability(from: string, to: string): Promise<StaffAvailability[]> {
  const rows = await db
    .select({
      editorId: staffAvailability.editorId,
      editorName: users.fullName,
      date: staffAvailability.date,
      kind: staffAvailability.kind,
      note: staffAvailability.note,
    })
    .from(staffAvailability)
    .innerJoin(users, eq(users.id, staffAvailability.editorId))
    .where(and(sql`${staffAvailability.date} >= ${from}`, sql`${staffAvailability.date} <= ${to}`))
    .limit(2000);
  return rows as StaffAvailability[];
}

export type BoardFilters = {
  termId?: string;
  grade?: number;
  subjectId?: string;
  weekNumber?: number;
  type?: DeliverableType;
  status?: ItemStatus;
  assigneeId?: string | "unassigned";
  availableOnly?: boolean;
  overdueOnly?: boolean;
};

export type BoardItem = {
  id: string;
  termId: string;
  termName: string;
  grade: number;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  weekNumber: number;
  type: DeliverableType;
  status: ItemStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  pointsValue: string;
  pointsAwarded: string | null;
  fileUrl: string | null;
  notes: string | null;
  scheduleNote: string | null;
  revisionCount: number;
  version: number;
};

const boardColumns = {
  id: workItems.id,
  termId: workItems.termId,
  termName: terms.name,
  grade: workItems.grade,
  subjectId: workItems.subjectId,
  subjectName: subjects.name,
  subjectCode: subjects.shortCode,
  weekNumber: workItems.weekNumber,
  type: workItems.type,
  status: workItems.status,
  assigneeId: workItems.assigneeId,
  assigneeName: users.fullName,
  dueDate: workItems.dueDate,
  pointsValue: workItems.pointsValue,
  pointsAwarded: workItems.pointsAwarded,
  fileUrl: workItems.fileUrl,
  notes: workItems.notes,
  scheduleNote: workItems.scheduleNote,
  revisionCount: workItems.revisionCount,
  version: workItems.version,
};

function buildConditions(filters: BoardFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.termId) conditions.push(eq(workItems.termId, filters.termId));
  if (filters.grade) conditions.push(eq(workItems.grade, filters.grade));
  if (filters.subjectId) conditions.push(eq(workItems.subjectId, filters.subjectId));
  if (filters.weekNumber) conditions.push(eq(workItems.weekNumber, filters.weekNumber));
  if (filters.type) conditions.push(eq(workItems.type, filters.type));
  if (filters.status) conditions.push(eq(workItems.status, filters.status));
  if (filters.assigneeId === "unassigned") {
    conditions.push(sql`${workItems.assigneeId} is null`);
  } else if (filters.assigneeId) {
    conditions.push(eq(workItems.assigneeId, filters.assigneeId));
  }
  if (filters.availableOnly) conditions.push(eq(workItems.status, "available"));
  if (filters.overdueOnly) {
    conditions.push(sql`${workItems.dueDate} < current_date and ${workItems.status} not in ('approved','uploaded','cancelled')`);
  }
  return conditions;
}

export async function getBoardItems(filters: BoardFilters): Promise<BoardItem[]> {
  const conditions = buildConditions(filters);

  const rows = await db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(workItems.dueDate), asc(workItems.grade), asc(subjects.name), asc(workItems.weekNumber))
    .limit(1000);

  return rows;
}

/**
 * Not-yet-finished catalog items matching the filters — the candidates for a
 * bulk backfill. Excludes approved/uploaded/cancelled so already-done work is
 * never offered for re-crediting.
 */
export async function getBackfillCandidates(filters: BoardFilters): Promise<BoardItem[]> {
  const conditions = buildConditions(filters);
  conditions.push(sql`${workItems.status} not in ('approved','uploaded','cancelled')`);

  return db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(and(...conditions))
    .orderBy(asc(workItems.grade), asc(subjects.name), asc(workItems.weekNumber), asc(workItems.type))
    .limit(1000);
}

/**
 * A single card on the Project Schedule, whether it comes from the catalog
 * (DLP/PPT work items) or a COT order. `dueDate` is the deadline that places it
 * on a day. `kind`/`actionRefId` tell the UI which action to call when the owner
 * reschedules it or edits its note (a work item vs. a COT order).
 */
export type ScheduleEntry = {
  kind: "catalog" | "cot";
  id: string; // unique per card
  actionRefId: string; // work item id (catalog) or custom order id (cot)
  type: DeliverableType;
  status: ItemStatus;
  dueDate: string;
  assigneeId: string | null;
  assigneeName: string | null;
  termName: string | null; // catalog term; null for COT
  title: string; // catalog: subject; cot: customer name
  subtitle: string; // catalog: "Grade X · Week Y"; cot: subject · topic
  scheduleNote: string | null;
  cotWorkKind: "new" | "align" | null; // COT only: brand-new work vs. alignment
  // The paired deliverable (DLP↔PPT) so, e.g., a PPT editor sees who has the
  // DLP file. Null when there is no counterpart.
  counterpartType: DeliverableType | null;
  counterpartAssigneeName: string | null;
};

/**
 * Entries for the project schedule in [from, to], keyed by their deadline.
 * Catalog items appear once they have a deadline; COT orders always carry one.
 * The whole lifecycle is shown so the grid is colour-codeable by status
 * (available → uploaded); only cancelled work drops off. A term filter narrows
 * to catalog items of that term (COT orders aren't term-bound, so they show only
 * in the combined "all terms" view).
 */
export async function getScheduleItems(
  from: string,
  to: string,
  filters: { termId?: string; assigneeId?: string } = {},
): Promise<ScheduleEntry[]> {
  const catalogConditions: SQL[] = [
    sql`${workItems.dueDate} is not null`,
    sql`${workItems.dueDate} >= ${from}`,
    sql`${workItems.dueDate} <= ${to}`,
    sql`${workItems.status} <> 'cancelled'`,
  ];
  if (filters.termId) catalogConditions.push(eq(workItems.termId, filters.termId));
  if (filters.assigneeId) catalogConditions.push(eq(workItems.assigneeId, filters.assigneeId));

  // The paired deliverable for the same lesson (same term/grade/subject/week,
  // opposite type) — so a PPT card can show who has the DLP, and vice versa.
  const sibling = alias(workItems, "sibling");
  const siblingUser = alias(users, "sibling_user");

  const catalogRows = await db
    .select({
      id: workItems.id,
      type: workItems.type,
      status: workItems.status,
      dueDate: workItems.dueDate,
      assigneeId: workItems.assigneeId,
      assigneeName: users.fullName,
      termName: terms.name,
      grade: workItems.grade,
      weekNumber: workItems.weekNumber,
      subjectName: subjects.name,
      subjectCode: subjects.shortCode,
      scheduleNote: workItems.scheduleNote,
      counterpartType: sibling.type,
      counterpartAssigneeName: siblingUser.fullName,
    })
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .leftJoin(
      sibling,
      and(
        eq(sibling.termId, workItems.termId),
        eq(sibling.grade, workItems.grade),
        eq(sibling.subjectId, workItems.subjectId),
        eq(sibling.weekNumber, workItems.weekNumber),
        ne(sibling.type, workItems.type),
      ),
    )
    .leftJoin(siblingUser, eq(siblingUser.id, sibling.assigneeId))
    .where(and(...catalogConditions))
    .orderBy(asc(workItems.dueDate), asc(workItems.grade), asc(subjects.name), asc(workItems.weekNumber))
    .limit(2000);

  const catalog: ScheduleEntry[] = catalogRows.map((r) => ({
    kind: "catalog",
    id: r.id,
    actionRefId: r.id,
    type: r.type,
    status: r.status,
    dueDate: r.dueDate as string,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    termName: r.termName,
    title: r.subjectCode || r.subjectName,
    subtitle: `Grade ${r.grade} · Week ${r.weekNumber}`,
    scheduleNote: r.scheduleNote,
    cotWorkKind: null,
    counterpartType: r.counterpartType ?? null,
    counterpartAssigneeName: r.counterpartAssigneeName ?? null,
  }));

  // COT orders aren't tied to a term, so only include them in the combined view.
  if (filters.termId) return catalog;

  // A COT item lands on its own scheduled_for when set, otherwise the order deadline.
  const cotPlanned = sql`coalesce(${customOrderItems.scheduledFor}, ${customOrders.deadline})`;
  const cotConditions: SQL[] = [
    sql`${cotPlanned} >= ${from}`,
    sql`${cotPlanned} <= ${to}`,
    sql`${customOrderItems.status} <> 'cancelled'`,
  ];
  if (filters.assigneeId) cotConditions.push(eq(customOrderItems.assigneeId, filters.assigneeId));

  // The other deliverable in the same COT order (DLP↔PPT) and its editor.
  const cotSibling = alias(customOrderItems, "cot_sibling");
  const cotSiblingUser = alias(users, "cot_sibling_user");

  const cotRows = await db
    .select({
      id: customOrderItems.id,
      orderId: customOrders.id,
      type: customOrderItems.type,
      status: customOrderItems.status,
      plannedFor: sql<string>`${cotPlanned}`,
      assigneeId: customOrderItems.assigneeId,
      assigneeName: users.fullName,
      customerName: customOrders.customerName,
      grade: customOrders.grade,
      subjectName: customOrders.subjectName,
      topic: customOrders.topic,
      scheduleNote: customOrders.scheduleNote,
      workKind: customOrders.workKind,
      counterpartType: cotSibling.type,
      counterpartAssigneeName: cotSiblingUser.fullName,
    })
    .from(customOrderItems)
    .innerJoin(customOrders, eq(customOrders.id, customOrderItems.orderId))
    .leftJoin(users, eq(users.id, customOrderItems.assigneeId))
    .leftJoin(
      cotSibling,
      and(eq(cotSibling.orderId, customOrderItems.orderId), ne(cotSibling.type, customOrderItems.type)),
    )
    .leftJoin(cotSiblingUser, eq(cotSiblingUser.id, cotSibling.assigneeId))
    .where(and(...cotConditions))
    .orderBy(asc(sql`${cotPlanned}`))
    .limit(2000);

  const cot: ScheduleEntry[] = cotRows.map((r) => {
    const parts = [r.grade ? `Grade ${r.grade}` : null, r.subjectName, r.topic].filter(Boolean);
    return {
      kind: "cot",
      id: r.id,
      actionRefId: r.orderId,
      type: r.type,
      status: r.status,
      dueDate: r.plannedFor,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      termName: null,
      title: r.customerName,
      subtitle: parts.length ? parts.join(" · ") : "Custom order",
      scheduleNote: r.scheduleNote,
      cotWorkKind: r.workKind,
      counterpartType: r.counterpartType ?? null,
      counterpartAssigneeName: r.counterpartAssigneeName ?? null,
    };
  });

  return [...catalog, ...cot];
}

export async function getTermGrades(termId: string) {
  const rows = await db
    .selectDistinct({ grade: termOfferings.grade })
    .from(termOfferings)
    .where(eq(termOfferings.termId, termId))
    .orderBy(asc(termOfferings.grade));
  return rows.map((r) => r.grade);
}

export async function getGradeSubjects(termId: string, grade: number) {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, shortCode: subjects.shortCode })
    .from(termOfferings)
    .innerJoin(subjects, eq(subjects.id, termOfferings.subjectId))
    .where(and(eq(termOfferings.termId, termId), eq(termOfferings.grade, grade)))
    .orderBy(asc(subjects.name));
  return rows;
}

export async function getMatrixItems(termId: string, grade: number, type: DeliverableType) {
  return db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(and(eq(workItems.termId, termId), eq(workItems.grade, grade), eq(workItems.type, type)))
    .orderBy(asc(subjects.name), asc(workItems.weekNumber));
}

export async function getMyWorkItems(assigneeId: string, statuses: ItemStatus[]) {
  const rows = await db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(and(eq(workItems.assigneeId, assigneeId), sql`${workItems.status} in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`))
    .orderBy(asc(workItems.dueDate));
  return rows;
}

export async function getReviewQueueItems() {
  return db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(eq(workItems.status, "in_review"))
    .orderBy(asc(workItems.submittedAt));
}

export async function getApprovedReadyToUpload() {
  return db
    .select(boardColumns)
    .from(workItems)
    .innerJoin(subjects, eq(subjects.id, workItems.subjectId))
    .innerJoin(terms, eq(terms.id, workItems.termId))
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(eq(workItems.status, "approved"))
    .orderBy(asc(workItems.approvedAt));
}

export async function getDashboardCounts(termId?: string) {
  const base = termId ? and(eq(workItems.termId, termId)) : undefined;

  const [statusCounts] = await db
    .select({
      available: sql<number>`count(*) filter (where ${workItems.status} = 'available')::int`,
      claimed: sql<number>`count(*) filter (where ${workItems.status} = 'claimed')::int`,
      inReview: sql<number>`count(*) filter (where ${workItems.status} = 'in_review')::int`,
      approved: sql<number>`count(*) filter (where ${workItems.status} = 'approved')::int`,
      uploaded: sql<number>`count(*) filter (where ${workItems.status} = 'uploaded')::int`,
      overdue: sql<number>`count(*) filter (where ${overdueCondition()})::int`,
      dueSoon: sql<number>`count(*) filter (where ${dueSoonCondition()})::int`,
      atRisk: sql<number>`count(*) filter (where ${atRiskCondition()})::int`,
    })
    .from(workItems)
    .where(base);

  return statusCounts;
}

// Deadline buckets (spec §6.3) — used by the dashboard. Approved/uploaded/
// cancelled count as done, so they never show as overdue or due-soon.
export function overdueCondition() {
  return sql`${workItems.dueDate} < current_date and ${workItems.status} not in ('approved','uploaded','cancelled')`;
}
export function dueSoonCondition() {
  return sql`${workItems.dueDate} >= current_date and ${workItems.dueDate} <= current_date + interval '3 days' and ${workItems.status} not in ('approved','uploaded','cancelled')`;
}
export function atRiskCondition() {
  return sql`${workItems.status} = 'available' and ${workItems.dueDate} >= current_date and ${workItems.dueDate} <= current_date + interval '5 days'`;
}

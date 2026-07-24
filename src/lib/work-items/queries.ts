import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems, subjects, users, terms, termOfferings } from "@/db/schema";
import type { DeliverableType, ItemStatus } from "@/lib/constants";

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
  dueDate: string;
  pointsValue: string;
  pointsAwarded: string | null;
  fileUrl: string | null;
  notes: string | null;
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
    conditions.push(sql`${workItems.dueDate} < current_date and ${workItems.status} not in ('uploaded','cancelled')`);
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

// Deadline buckets (spec §6.3) — used by the dashboard.
export function overdueCondition() {
  return sql`${workItems.dueDate} < current_date and ${workItems.status} not in ('uploaded','cancelled')`;
}
export function dueSoonCondition() {
  return sql`${workItems.dueDate} >= current_date and ${workItems.dueDate} <= current_date + interval '3 days' and ${workItems.status} not in ('uploaded','cancelled')`;
}
export function atRiskCondition() {
  return sql`${workItems.status} = 'available' and ${workItems.dueDate} >= current_date and ${workItems.dueDate} <= current_date + interval '5 days'`;
}

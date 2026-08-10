import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { termOfferings, termWeeks, workItems } from "@/db/schema";
import { getPointsTable } from "@/lib/settings";
import { getSubjectPointsMap, pointsForItem } from "@/lib/catalog/subject-points";
import type { DeliverableType } from "@/lib/constants";

// Deadlines are no longer set here — items are created without one and get a
// deadline when they're assigned/scheduled. `uploadDeadline` stays optional for
// callers that still want to pre-set week deadlines.
export type CatalogWeekInput = { weekNumber: number; uploadDeadline?: string | null };

export type CatalogGeneratorInput = {
  termId: string;
  grades: number[];
  /** grade -> subject ids that get a DLP item each week */
  dlpByGrade: Record<number, string[]>;
  /** grade -> subject ids that get a PPT item each week */
  pptByGrade: Record<number, string[]>;
  weeks: CatalogWeekInput[];
};

/** All subject ids offered for a grade — the union across every deliverable type. */
function offeredSubjects(input: CatalogGeneratorInput, grade: number): string[] {
  return [...new Set([...(input.dlpByGrade[grade] ?? []), ...(input.pptByGrade[grade] ?? [])])];
}

type PlannedItem = {
  grade: number;
  subjectId: string;
  weekNumber: number;
  type: DeliverableType;
};

function naturalKey(item: { grade: number; subjectId: string; weekNumber: number; type: string }) {
  return `${item.grade}|${item.subjectId}|${item.weekNumber}|${item.type}`;
}

function planItems(input: CatalogGeneratorInput): PlannedItem[] {
  const items: PlannedItem[] = [];
  for (const grade of input.grades) {
    const dlp = new Set(input.dlpByGrade[grade] ?? []);
    const ppt = new Set(input.pptByGrade[grade] ?? []);
    for (const subjectId of offeredSubjects(input, grade)) {
      for (const week of input.weeks) {
        if (dlp.has(subjectId)) items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "DLP" });
        if (ppt.has(subjectId)) items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "PPT" });
      }
    }
  }
  return items;
}

async function existingNaturalKeys(termId: string): Promise<Set<string>> {
  const rows = await db
    .select({ grade: workItems.grade, subjectId: workItems.subjectId, weekNumber: workItems.weekNumber, type: workItems.type })
    .from(workItems)
    .where(eq(workItems.termId, termId));
  return new Set(rows.map(naturalKey));
}

export async function previewCatalog(input: CatalogGeneratorInput) {
  const planned = planItems(input);
  const existing = await existingNaturalKeys(input.termId);
  const toSkip = planned.filter((item) => existing.has(naturalKey(item))).length;
  return { toCreate: planned.length - toSkip, toSkip, total: planned.length };
}

export async function generateCatalog(input: CatalogGeneratorInput) {
  return db.transaction(async (tx) => {
    if (input.grades.length) {
      const offeringRows = input.grades.flatMap((grade) =>
        offeredSubjects(input, grade).map((subjectId) => ({ termId: input.termId, grade, subjectId })),
      );
      if (offeringRows.length) {
        await tx.insert(termOfferings).values(offeringRows).onConflictDoNothing();
      }
    }

    // Only record week deadlines when a caller actually provides them; the
    // catalog wizard no longer does, leaving items deadline-less until assigned.
    const weeksWithDeadline = input.weeks.filter((w) => w.uploadDeadline);
    if (weeksWithDeadline.length) {
      await tx
        .insert(termWeeks)
        .values(weeksWithDeadline.map((w) => ({ termId: input.termId, weekNumber: w.weekNumber, uploadDeadline: w.uploadDeadline! })))
        .onConflictDoNothing();
    }

    const weekRows = await tx
      .select()
      .from(termWeeks)
      .where(
        and(
          eq(termWeeks.termId, input.termId),
          inArray(
            termWeeks.weekNumber,
            input.weeks.map((w) => w.weekNumber),
          ),
        ),
      );
    const deadlineByWeek = new Map(weekRows.map((w) => [w.weekNumber, w.uploadDeadline]));

    const pointsTable = await getPointsTable(tx);
    const planned = planItems(input);
    const subjectOverrides = await getSubjectPointsMap(
      tx,
      [...new Set(planned.map((p) => p.subjectId))],
    );

    const itemRows = planned.map((item) => ({
      termId: input.termId,
      grade: item.grade,
      subjectId: item.subjectId,
      weekNumber: item.weekNumber,
      type: item.type,
      // No deadline at creation; set later when assigned/scheduled.
      dueDate: deadlineByWeek.get(item.weekNumber) ?? null,
      pointsValue: String(pointsForItem(subjectOverrides, pointsTable, item.subjectId, item.type)),
    }));

    let created: { id: string }[] = [];
    if (itemRows.length) {
      created = await tx.insert(workItems).values(itemRows).onConflictDoNothing().returning({ id: workItems.id });
    }

    return { attempted: itemRows.length, created: created.length, skipped: itemRows.length - created.length };
  });
}

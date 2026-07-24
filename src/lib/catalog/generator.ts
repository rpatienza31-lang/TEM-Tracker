import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { termOfferings, termWeeks, workItems } from "@/db/schema";
import { getPointsTable } from "@/lib/settings";
import type { DeliverableType } from "@/lib/constants";

export type CatalogWeekInput = { weekNumber: number; uploadDeadline: string };

export type CatalogGeneratorInput = {
  termId: string;
  grades: number[];
  /** grade -> subject ids offered that grade this term (always get DLP + PPT) */
  subjectsByGrade: Record<number, string[]>;
  /** grade -> subject ids that also get a COT-DLP item (subset of subjectsByGrade[grade]) */
  cotDlpByGrade: Record<number, string[]>;
  /** grade -> subject ids that also get a COT-PPT item (subset of subjectsByGrade[grade]) */
  cotPptByGrade: Record<number, string[]>;
  weeks: CatalogWeekInput[];
};

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
    const subjectIds = input.subjectsByGrade[grade] ?? [];
    const cotDlpSubjectIds = new Set(input.cotDlpByGrade[grade] ?? []);
    const cotPptSubjectIds = new Set(input.cotPptByGrade[grade] ?? []);
    for (const subjectId of subjectIds) {
      for (const week of input.weeks) {
        items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "DLP" });
        items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "PPT" });
        if (cotDlpSubjectIds.has(subjectId)) {
          items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "COT_DLP" });
        }
        if (cotPptSubjectIds.has(subjectId)) {
          items.push({ grade, subjectId, weekNumber: week.weekNumber, type: "COT_PPT" });
        }
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
        (input.subjectsByGrade[grade] ?? []).map((subjectId) => ({ termId: input.termId, grade, subjectId })),
      );
      if (offeringRows.length) {
        await tx.insert(termOfferings).values(offeringRows).onConflictDoNothing();
      }
    }

    if (input.weeks.length) {
      await tx
        .insert(termWeeks)
        .values(input.weeks.map((w) => ({ termId: input.termId, weekNumber: w.weekNumber, uploadDeadline: w.uploadDeadline })))
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

    const pointsTable = await getPointsTable();
    const planned = planItems(input);

    const itemRows = planned
      .map((item) => {
        const dueDate = deadlineByWeek.get(item.weekNumber);
        if (!dueDate) return null;
        return {
          termId: input.termId,
          grade: item.grade,
          subjectId: item.subjectId,
          weekNumber: item.weekNumber,
          type: item.type,
          dueDate,
          pointsValue: String(pointsTable[item.type]),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    let created: { id: string }[] = [];
    if (itemRows.length) {
      created = await tx.insert(workItems).values(itemRows).onConflictDoNothing().returning({ id: workItems.id });
    }

    return { attempted: itemRows.length, created: created.length, skipped: itemRows.length - created.length };
  });
}

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { termOfferings, workItems } from "@/db/schema";

export type RemoveSubjectResult = { ok: true; removed: number } | { ok: false; message: string };

/**
 * Removes a subject from a grade in a term: deletes its work items (all weeks
 * and deliverable types) and the term offering. Refuses if any item has been
 * claimed or beyond, so no in-progress work or awarded points are ever lost —
 * those must be released first.
 */
export async function removeSubjectFromGrade(
  termId: string,
  grade: number,
  subjectId: string,
): Promise<RemoveSubjectResult> {
  const where = and(eq(workItems.termId, termId), eq(workItems.grade, grade), eq(workItems.subjectId, subjectId));

  const items = await db.select({ id: workItems.id, status: workItems.status }).from(workItems).where(where);
  const inProgress = items.filter((i) => i.status !== "available" && i.status !== "cancelled");
  if (inProgress.length > 0) {
    return {
      ok: false,
      message: `Can't remove — ${inProgress.length} item(s) are already claimed or further along. Release them first.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(workItems).where(where);
    await tx
      .delete(termOfferings)
      .where(and(eq(termOfferings.termId, termId), eq(termOfferings.grade, grade), eq(termOfferings.subjectId, subjectId)));
  });

  return { ok: true, removed: items.length };
}

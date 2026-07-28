import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { removeSubjectFromGrade } from "@/lib/catalog/offerings";
import { makeSubject, makeTerm, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("removeSubjectFromGrade", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("removes all of a subject's items for a grade when none are in progress", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    await makeWorkItem({ termId: term.id, subjectId: subject.id, grade: 2, type: "DLP", weekNumber: 1 });
    await makeWorkItem({ termId: term.id, subjectId: subject.id, grade: 2, type: "PPT", weekNumber: 1 });

    const result = await removeSubjectFromGrade(term.id, 2, subject.id);
    expect(result.ok).toBe(true);

    const left = await db
      .select()
      .from(workItems)
      .where(and(eq(workItems.termId, term.id), eq(workItems.grade, 2), eq(workItems.subjectId, subject.id)));
    expect(left).toHaveLength(0);
  });

  it("refuses to remove a subject that has claimed/in-progress work", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, grade: 2, type: "DLP", weekNumber: 1 });
    await db.update(workItems).set({ status: "claimed" }).where(eq(workItems.id, item.id));

    const result = await removeSubjectFromGrade(term.id, 2, subject.id);
    expect(result.ok).toBe(false);

    // Nothing deleted.
    const left = await db.select().from(workItems).where(eq(workItems.subjectId, subject.id));
    expect(left).toHaveLength(1);
  });
});

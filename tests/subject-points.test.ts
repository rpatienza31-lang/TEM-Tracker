import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { generateCatalog } from "@/lib/catalog/generator";
import { setSubjectPoints, getSubjectPointsRow } from "@/lib/catalog/subject-points";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

async function itemsFor(subjectId: string, type: "DLP" | "PPT") {
  return db
    .select()
    .from(workItems)
    .where(and(eq(workItems.subjectId, subjectId), eq(workItems.type, type)));
}

describe("per-subject point overrides", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("stamps the override onto newly generated catalog items, per type", async () => {
    const term = await makeTerm();
    const afa = await makeSubject("EPP-AFA", "EPP-AFA");
    const math = await makeSubject("Mathematics", "MATH");

    await setSubjectPoints(afa.id, "DLP", 0.6);
    await setSubjectPoints(afa.id, "PPT", 0.6);

    await generateCatalog({
      termId: term.id,
      grades: [4],
      dlpByGrade: { 4: [afa.id, math.id] },
      pptByGrade: { 4: [afa.id, math.id] },
      weeks: [{ weekNumber: 1, uploadDeadline: "2099-01-01" }],
    });

    const [afaDlp] = await itemsFor(afa.id, "DLP");
    const [afaPpt] = await itemsFor(afa.id, "PPT");
    const [mathDlp] = await itemsFor(math.id, "DLP");
    expect(Number(afaDlp.pointsValue)).toBe(0.6);
    expect(Number(afaPpt.pointsValue)).toBe(0.6);
    expect(Number(mathDlp.pointsValue)).toBe(1); // no override → global default
  });

  it("re-snapshots not-yet-approved items but leaves approved ones alone", async () => {
    const term = await makeTerm();
    const ict = await makeSubject("EPP-ICT", "EPP-ICT");
    const editor = await makeUser("editor", "Editor One");

    // One available item and one already-approved item, both worth 1.0.
    const available = await makeWorkItem({ termId: term.id, subjectId: ict.id, weekNumber: 1, type: "DLP" });
    const approved = await makeWorkItem({ termId: term.id, subjectId: ict.id, weekNumber: 2, type: "DLP" });
    await db
      .update(workItems)
      .set({ status: "approved", assigneeId: editor.id, pointsAwarded: "1", approvedAt: new Date() })
      .where(eq(workItems.id, approved.id));

    await setSubjectPoints(ict.id, "DLP", 0.4);

    const [a] = await db.select().from(workItems).where(eq(workItems.id, available.id));
    const [b] = await db.select().from(workItems).where(eq(workItems.id, approved.id));
    expect(Number(a.pointsValue)).toBe(0.4); // pending → updated
    expect(Number(b.pointsValue)).toBe(1); // approved snapshot preserved
  });

  it("reports the effective points for a subject (override or global)", async () => {
    const afa = await makeSubject("EPP-AFA", "EPP-AFA");
    await setSubjectPoints(afa.id, "DLP", 0.6);

    const row = await getSubjectPointsRow(afa.id);
    expect(row.DLP).toBe(0.6); // overridden
    expect(row.PPT).toBe(1); // falls back to global default
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { generateCatalog, previewCatalog } from "@/lib/catalog/generator";
import { makeSubject, makeTerm, resetDb, seedSettings } from "./helpers";

describe("catalog generator", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("creates the expected count for grades x subjects x weeks, and re-running creates zero duplicates", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");
    const science = await makeSubject("Science", "SCI");

    const input = {
      termId: term.id,
      grades: [3, 4],
      subjectsByGrade: { 3: [math.id, science.id], 4: [math.id, science.id] },
      cotByGrade: {},
      weeks: Array.from({ length: 10 }, (_, i) => ({ weekNumber: i + 1, uploadDeadline: "2099-01-01" })),
    };

    const preview = await previewCatalog(input);
    expect(preview.toCreate).toBe(2 * 2 * 10); // 2 grades x 2 subjects x 10 weeks x 1 DLP each
    expect(preview.toSkip).toBe(0);

    const first = await generateCatalog(input);
    expect(first.created).toBe(40);
    expect(first.skipped).toBe(0);

    const rows = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rows).toHaveLength(40);

    const second = await generateCatalog(input);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(40);

    const rowsAfterRerun = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rowsAfterRerun).toHaveLength(40);
  });

  it("backfills only the missing items when a subject is added after the first run", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");

    const weeks = Array.from({ length: 10 }, (_, i) => ({ weekNumber: i + 1, uploadDeadline: "2099-01-01" }));
    await generateCatalog({
      termId: term.id,
      grades: [4],
      subjectsByGrade: { 4: [math.id] },
      cotByGrade: {},
      weeks,
    });

    const science = await makeSubject("Science", "SCI");
    const result = await generateCatalog({
      termId: term.id,
      grades: [4],
      subjectsByGrade: { 4: [math.id, science.id] },
      cotByGrade: {},
      weeks,
    });

    expect(result.created).toBe(10); // only Science's 10 weeks are new
    expect(result.skipped).toBe(10); // Math's 10 weeks already existed
  });

  it("supports a partial COT selection alongside DLP", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");
    const science = await makeSubject("Science", "SCI");

    const result = await generateCatalog({
      termId: term.id,
      grades: [4],
      subjectsByGrade: { 4: [math.id, science.id] },
      cotByGrade: { 4: [math.id] }, // only Math gets COT
      weeks: [{ weekNumber: 1, uploadDeadline: "2099-01-01" }],
    });

    expect(result.created).toBe(3); // Math DLP + Math COT + Science DLP
    const rows = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rows.filter((r) => r.type === "COT")).toHaveLength(1);
  });
});

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

  it("creates a DLP + PPT item per grade x subject x week, and re-running creates zero duplicates", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");
    const science = await makeSubject("Science", "SCI");

    const input = {
      termId: term.id,
      grades: [3, 4],
      dlpByGrade: { 3: [math.id, science.id], 4: [math.id, science.id] },
      pptByGrade: { 3: [math.id, science.id], 4: [math.id, science.id] },
      weeks: Array.from({ length: 10 }, (_, i) => ({ weekNumber: i + 1, uploadDeadline: "2099-01-01" })),
    };

    const preview = await previewCatalog(input);
    expect(preview.toCreate).toBe(2 * 2 * 10 * 2); // 2 grades x 2 subjects x 10 weeks x (DLP + PPT)
    expect(preview.toSkip).toBe(0);

    const first = await generateCatalog(input);
    expect(first.created).toBe(80);
    expect(first.skipped).toBe(0);

    const rows = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rows).toHaveLength(80);
    expect(rows.filter((r) => r.type === "DLP")).toHaveLength(40);
    expect(rows.filter((r) => r.type === "PPT")).toHaveLength(40);

    const second = await generateCatalog(input);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(80);

    const rowsAfterRerun = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rowsAfterRerun).toHaveLength(80);
  });

  it("creates items with no deadline when weeks carry none (deadlines are set later on assignment)", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");

    const result = await generateCatalog({
      termId: term.id,
      grades: [4],
      dlpByGrade: { 4: [math.id] },
      pptByGrade: { 4: [math.id] },
      weeks: Array.from({ length: 3 }, (_, i) => ({ weekNumber: i + 1 })), // no uploadDeadline
    });

    expect(result.created).toBe(6); // 1 subject x 3 weeks x (DLP + PPT)
    const rows = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.dueDate === null)).toBe(true);
  });

  it("supports weeks up to 14", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");

    const result = await generateCatalog({
      termId: term.id,
      grades: [4],
      dlpByGrade: { 4: [math.id] },
      pptByGrade: { 4: [math.id] },
      weeks: [{ weekNumber: 11 }, { weekNumber: 12 }, { weekNumber: 13 }, { weekNumber: 14 }],
    });

    expect(result.created).toBe(8); // 4 weeks x (DLP + PPT)
    const rows = await db.select().from(workItems).where(eq(workItems.termId, term.id));
    expect(Math.max(...rows.map((r) => r.weekNumber))).toBe(14);
  });

  it("backfills only the missing items when a subject is added after the first run", async () => {
    const term = await makeTerm();
    const math = await makeSubject("Mathematics", "MATH");

    const weeks = Array.from({ length: 10 }, (_, i) => ({ weekNumber: i + 1, uploadDeadline: "2099-01-01" }));
    await generateCatalog({
      termId: term.id,
      grades: [4],
      dlpByGrade: { 4: [math.id] },
      pptByGrade: { 4: [math.id] },
      weeks,
    });

    const science = await makeSubject("Science", "SCI");
    const result = await generateCatalog({
      termId: term.id,
      grades: [4],
      dlpByGrade: { 4: [math.id, science.id] },
      pptByGrade: { 4: [math.id, science.id] },
      weeks,
    });

    expect(result.created).toBe(20); // only Science's 10 weeks x (DLP + PPT) are new
    expect(result.skipped).toBe(20); // Math's 10 weeks x (DLP + PPT) already existed
  });
});

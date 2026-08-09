import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { quotaCycleItems, workItems } from "@/db/schema";
import { bulkBackfillWorkItems } from "@/lib/catalog/backfill";
import { getBackfillCandidates } from "@/lib/work-items/queries";
import { getProductivityStats } from "@/lib/quota/productivity";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("bulk backfill", () => {
  let editorId: string;
  let adminId: string;
  let termId: string;
  let subjectId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    editorId = (await makeUser("editor", "Backfill Editor")).id;
    adminId = (await makeUser("admin", "Admin One")).id;
    termId = (await makeTerm()).id;
    subjectId = (await makeSubject()).id;
  });

  it("credits selected items to the editor and marks them done", async () => {
    const a = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    const b = await makeWorkItem({ termId, subjectId, weekNumber: 2, type: "DLP" });

    const candidates = await getBackfillCandidates({ termId });
    expect(candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

    const actor = { id: adminId, role: "admin" } as never;
    const res = await bulkBackfillWorkItems({ itemIds: [a.id, b.id], editorId, markUploaded: true, actor });
    expect(res.done).toBe(2);
    expect(res.skipped).toBe(0);

    const rows = await db.select().from(workItems).where(eq(workItems.termId, termId));
    expect(rows.every((r) => r.status === "uploaded" && r.assigneeId === editorId)).toBe(true);

    const ledger = await db.select().from(quotaCycleItems);
    expect(ledger).toHaveLength(2); // both credited into the cycle

    const [stats] = (await getProductivityStats()).filter((r) => r.editorId === editorId);
    expect(stats.totalPoints).toBe(2);

    // No longer candidates once finished.
    expect(await getBackfillCandidates({ termId })).toHaveLength(0);
  });

  it("skips items that are already finished", async () => {
    const a = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    await db.update(workItems).set({ status: "uploaded" }).where(eq(workItems.id, a.id));

    const actor = { id: adminId, role: "admin" } as never;
    const res = await bulkBackfillWorkItems({ itemIds: [a.id], editorId, markUploaded: true, actor });
    expect(res.done).toBe(0);
    expect(res.skipped).toBe(1);
    expect(await db.select().from(quotaCycleItems)).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, customOrders, quotaCycles } from "@/db/schema";
import { bulkBackfillCotItems } from "@/lib/cot/backfill";
import { getCotBackfillCandidates } from "@/lib/cot/queries";
import { makeUser, resetDb, seedSettings } from "./helpers";

async function makeCotItem(opts: { customerName: string; type?: "COT_DLP" | "COT_PPT"; deadline?: string }) {
  const [order] = await db
    .insert(customOrders)
    .values({
      customerName: opts.customerName,
      orderDate: "2099-01-01",
      deadline: opts.deadline ?? "2099-01-08",
      subjectName: "Science",
      topic: "Cells",
    })
    .returning();
  const [item] = await db
    .insert(customOrderItems)
    .values({ orderId: order.id, type: opts.type ?? "COT_DLP" })
    .returning();
  return item;
}

describe("COT bulk backfill", () => {
  let editorId: string;
  let adminId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    editorId = (await makeUser("editor", "COT Editor")).id;
    adminId = (await makeUser("admin", "Admin One")).id;
  });

  it("credits selected COT orders to the editor and marks them done", async () => {
    const a = await makeCotItem({ customerName: "Mary Joy" });
    const b = await makeCotItem({ customerName: "Felisa" });

    const candidates = await getCotBackfillCandidates();
    expect(candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

    const actor = { id: adminId, role: "admin" } as never;
    const res = await bulkBackfillCotItems({ itemIds: [a.id, b.id], editorId, markUploaded: true, actor });
    expect(res.done).toBe(2);
    expect(res.skipped).toBe(0);

    const items = await db.select().from(customOrderItems);
    expect(items.every((i) => i.status === "uploaded" && i.assigneeId === editorId && i.awardedCycleId)).toBe(true);

    // 2 COT items × 0.5 pts each = 1.0 in the editor's open cycle.
    const cycles = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editorId));
    expect(cycles.reduce((s, c) => s + Number(c.pointsTotal), 0)).toBe(1);

    expect(await getCotBackfillCandidates()).toHaveLength(0);
  });

  it("skips COT items that are already finished", async () => {
    const a = await makeCotItem({ customerName: "Done Already" });
    await db.update(customOrderItems).set({ status: "approved" }).where(eq(customOrderItems.id, a.id));

    const actor = { id: adminId, role: "admin" } as never;
    const res = await bulkBackfillCotItems({ itemIds: [a.id], editorId, markUploaded: true, actor });
    expect(res.done).toBe(0);
    expect(res.skipped).toBe(1);
  });
});

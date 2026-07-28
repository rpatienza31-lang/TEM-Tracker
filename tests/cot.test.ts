import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, quotaCycles } from "@/db/schema";
import { computeDeadline, priorityFor } from "@/lib/cot/deadline";
import { createCotOrder, claimCotItem, submitCotItem, approveCotItem, deleteCotOrder } from "@/lib/cot/service";
import { getActiveCotOrders, getCotLibrary } from "@/lib/cot/queries";
import { makeUser, resetDb, seedSettings } from "./helpers";

describe("COT deadline", () => {
  it("adds 5 calendar days for rush and 7 for regular", () => {
    expect(computeDeadline("2026-07-01", "rush")).toBe("2026-07-06");
    expect(computeDeadline("2026-07-01", "regular")).toBe("2026-07-08");
  });

  it("flags red within a day and alert within three", () => {
    expect(priorityFor("2026-07-10", "2026-07-10").level).toBe("red"); // due today
    expect(priorityFor("2026-07-11", "2026-07-10").level).toBe("red"); // tomorrow
    expect(priorityFor("2026-07-13", "2026-07-10").level).toBe("alert"); // 3 days
    expect(priorityFor("2026-07-20", "2026-07-10").level).toBe("normal");
    expect(priorityFor("2026-07-09", "2026-07-10").level).toBe("overdue");
  });
});

describe("COT order lifecycle", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("awards COT points into the editor's quota cycle and moves the order to the library when done", async () => {
    const editor = await makeUser("editor", "Cot Editor");
    const admin = await makeUser("admin", "Cot Admin");
    const editorActor = { id: editor.id, role: "editor" as const };
    const adminActor = { id: admin.id, role: "admin" as const };

    const created = await createCotOrder({
      customerName: "Juan Dela Cruz",
      grade: 5,
      subjectName: "Science",
      topic: "Photosynthesis",
      orderType: "rush",
      orderDate: "2026-07-01",
    });
    expect(created.ok).toBe(true);

    const items = await db.select().from(customOrderItems);
    expect(items).toHaveLength(2); // COT_DLP + COT_PPT

    // Only in the active list while unfinished.
    expect(await getActiveCotOrders()).toHaveLength(1);
    expect(await getCotLibrary()).toHaveLength(0);

    // Complete both deliverables.
    for (const item of items) {
      expect((await claimCotItem(item.id, editorActor)).ok).toBe(true);
      expect((await submitCotItem(item.id, editorActor, "https://drive.test/f")).ok).toBe(true);
      expect((await approveCotItem(item.id, adminActor)).ok).toBe(true);
    }

    // 0.5 + 0.5 = 1 point in the editor's open quota cycle.
    const [cycle] = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editor.id)).limit(1);
    expect(Number(cycle.pointsTotal)).toBe(1);

    // Order is now completed → in the library, out of the active list.
    expect(await getActiveCotOrders()).toHaveLength(0);
    expect(await getCotLibrary()).toHaveLength(1);
  });

  it("deleting an order reverses any points it had awarded", async () => {
    const editor = await makeUser("editor", "Del Editor");
    const admin = await makeUser("admin", "Del Admin");
    const editorActor = { id: editor.id, role: "editor" as const };
    const adminActor = { id: admin.id, role: "admin" as const };

    await createCotOrder({ customerName: "To Delete", orderType: "regular", orderDate: "2026-07-01" });
    const items = await db.select().from(customOrderItems);
    for (const item of items) {
      await claimCotItem(item.id, editorActor);
      await submitCotItem(item.id, editorActor, "https://drive.test/f");
      await approveCotItem(item.id, adminActor);
    }

    const [before] = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editor.id)).limit(1);
    expect(Number(before.pointsTotal)).toBe(1);

    const orderId = items[0].orderId;
    expect((await deleteCotOrder(orderId, adminActor)).ok).toBe(true);

    expect(await db.select().from(customOrderItems)).toHaveLength(0);
    const [after] = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editor.id)).limit(1);
    expect(Number(after.pointsTotal)).toBe(0);
  });

  it("prevents a second editor from claiming an already-claimed item", async () => {
    const a = await makeUser("editor", "Editor A");
    const b = await makeUser("editor", "Editor B");

    await createCotOrder({ customerName: "Cust", orderType: "regular", orderDate: "2026-07-01" });
    const [item] = await db.select().from(customOrderItems).limit(1);

    expect((await claimCotItem(item.id, { id: a.id, role: "editor" })).ok).toBe(true);
    expect((await claimCotItem(item.id, { id: b.id, role: "editor" })).ok).toBe(false);
  });
});

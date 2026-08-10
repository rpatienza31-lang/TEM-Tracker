import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, customOrders, workItems } from "@/db/schema";
import { getScheduleItems } from "@/lib/work-items/queries";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

async function makeCotOrder(opts: { customerName?: string; deadline: string; type?: "COT_DLP" | "COT_PPT"; assigneeId?: string }) {
  const [order] = await db
    .insert(customOrders)
    .values({
      customerName: opts.customerName ?? "Customer A",
      orderDate: opts.deadline,
      deadline: opts.deadline,
      subjectName: "Science",
      topic: "Photosynthesis",
    })
    .returning();
  const [item] = await db
    .insert(customOrderItems)
    .values({ orderId: order.id, type: opts.type ?? "COT_DLP", assigneeId: opts.assigneeId })
    .returning();
  return { order, item };
}

describe("project schedule (deadline-driven, catalog + COT)", () => {
  let termId: string;
  let subjectId: string;
  let editorId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    termId = term.id;
    subjectId = subject.id;
    editorId = editor.id;
  });

  it("places an item on its deadline day", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe("2099-03-10");
    expect(rows[0].kind).toBe("catalog");
  });

  it("leaves items with no deadline off the schedule until one is set", async () => {
    const item = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ dueDate: null }).where(eq(workItems.id, item.id));

    let rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(0);

    await db.update(workItems).set({ dueDate: "2099-03-12", assigneeId: editorId }).where(eq(workItems.id, item.id));
    rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe("2099-03-12");
    expect(rows[0].assigneeId).toBe(editorId);
  });

  it("includes COT orders on their deadline in the combined (all-terms) view", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeCotOrder({ customerName: "Mary Joy", deadline: "2099-03-11", assigneeId: editorId });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(2);
    const cot = rows.find((r) => r.kind === "cot")!;
    expect(cot.title).toBe("Mary Joy");
    expect(cot.dueDate).toBe("2099-03-11");
    expect(cot.assigneeId).toBe(editorId);
    expect(cot.type).toBe("COT_DLP");
  });

  it("excludes COT orders when narrowed to a specific term", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeCotOrder({ deadline: "2099-03-11" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31", { termId });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("catalog");
  });

  it("keeps uploaded work visible (for status colour) but hides cancelled", async () => {
    const uploaded = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ status: "uploaded" }).where(eq(workItems.id, uploaded.id));
    const cancelled = await makeWorkItem({ termId, subjectId, weekNumber: 2, dueDate: "2099-03-10" });
    await db.update(workItems).set({ status: "cancelled" }).where(eq(workItems.id, cancelled.id));
    await makeWorkItem({ termId, subjectId, weekNumber: 3, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    const subtitles = rows.map((r) => r.subtitle).sort();
    expect(subtitles).toEqual(["Grade 4 · Week 1", "Grade 4 · Week 3"]);
  });

  it("only returns deadlines inside the window", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeWorkItem({ termId, subjectId, weekNumber: 2, dueDate: "2099-04-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].subtitle).toBe("Grade 4 · Week 1");
  });

  it("filters by term", async () => {
    const otherTerm = await makeTerm("Other Term");
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeWorkItem({ termId: otherTerm.id, subjectId, weekNumber: 1, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31", { termId });
    expect(rows).toHaveLength(1);
    expect(rows[0].termName).toBe("Test Term");
  });
});

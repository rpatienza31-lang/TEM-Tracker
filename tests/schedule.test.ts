import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { getScheduleItems } from "@/lib/work-items/queries";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("project schedule (deadline-driven)", () => {
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
  });

  it("leaves items with no deadline off the schedule until one is set", async () => {
    const item = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ dueDate: null }).where(eq(workItems.id, item.id));

    let rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(0); // no deadline → not scheduled

    // Setting a deadline (as assignment does) puts it on the board on that day.
    await db.update(workItems).set({ dueDate: "2099-03-12", assigneeId: editorId }).where(eq(workItems.id, item.id));
    rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe("2099-03-12");
    expect(rows[0].assigneeId).toBe(editorId);
  });

  it("hides finished (uploaded/cancelled) work", async () => {
    const done = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ status: "uploaded" }).where(eq(workItems.id, done.id));
    await makeWorkItem({ termId, subjectId, weekNumber: 2, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].weekNumber).toBe(2);
  });

  it("only returns deadlines inside the window", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeWorkItem({ termId, subjectId, weekNumber: 2, dueDate: "2099-04-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].weekNumber).toBe(1);
  });

  it("filters by term", async () => {
    const otherTerm = await makeTerm("Other Term");
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await makeWorkItem({ termId: otherTerm.id, subjectId, weekNumber: 1, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31", { termId });
    expect(rows).toHaveLength(1);
    expect(rows[0].termId).toBe(termId);
  });
});

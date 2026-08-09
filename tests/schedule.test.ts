import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { getScheduleItems } from "@/lib/work-items/queries";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("project schedule", () => {
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

  it("falls back to the deadline when nothing is planned", async () => {
    await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].plannedFor).toBe("2099-03-10");
    expect(rows[0].isScheduled).toBe(false);
  });

  it("uses the planned date over the deadline once set", async () => {
    const item = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ scheduledFor: "2099-03-05", assigneeId: editorId }).where(eq(workItems.id, item.id));

    // The deadline day no longer contains it…
    const onDeadline = await getScheduleItems("2099-03-10", "2099-03-10");
    expect(onDeadline).toHaveLength(0);

    // …the planned day does.
    const onPlanned = await getScheduleItems("2099-03-05", "2099-03-05");
    expect(onPlanned).toHaveLength(1);
    expect(onPlanned[0].isScheduled).toBe(true);
    expect(onPlanned[0].assigneeId).toBe(editorId);
  });

  it("hides finished (uploaded/cancelled) work", async () => {
    const done = await makeWorkItem({ termId, subjectId, weekNumber: 1, dueDate: "2099-03-10" });
    await db.update(workItems).set({ status: "uploaded" }).where(eq(workItems.id, done.id));
    await makeWorkItem({ termId, subjectId, weekNumber: 2, dueDate: "2099-03-10" });

    const rows = await getScheduleItems("2099-03-01", "2099-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].weekNumber).toBe(2);
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

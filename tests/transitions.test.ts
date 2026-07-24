import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { workItems, workItemEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("transitionWorkItem", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("lets an editor claim an available item", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    const result = await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.status).toBe("claimed");
      expect(result.item.assigneeId).toBe(editor.id);
    }
  });

  it("rejects a claim on an item that is already claimed (DB-level guard, not a race)", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editorA = await makeUser("editor", "Editor A");
    const editorB = await makeUser("editor", "Editor B");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    const first = await transitionWorkItem({ action: "claim", itemId: item.id, actor: editorA });
    expect(first.ok).toBe(true);

    const second = await transitionWorkItem({ action: "claim", itemId: item.id, actor: editorB });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("conflict");
      expect(second.error.message).toContain("Editor A");
    }
  });

  it("only lets exactly one of two concurrent claim requests for the same item succeed", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editorA = await makeUser("editor", "Editor A");
    const editorB = await makeUser("editor", "Editor B");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    const [resultA, resultB] = await Promise.all([
      transitionWorkItem({ action: "claim", itemId: item.id, actor: editorA }),
      transitionWorkItem({ action: "claim", itemId: item.id, actor: editorB }),
    ]);

    const oks = [resultA, resultB].filter((r) => r.ok);
    expect(oks).toHaveLength(1);

    const [row] = await db.select().from(workItems).where(eq(workItems.id, item.id));
    expect(row.status).toBe("claimed");
    expect([editorA.id, editorB.id]).toContain(row.assigneeId);
  });

  it("enforces the WIP limit", async () => {
    await resetDb();
    await seedSettings({ wipLimit: 2 });
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Busy Editor");

    const items = await Promise.all(
      Array.from({ length: 3 }, (_, i) => makeWorkItem({ termId: term.id, subjectId: subject.id, weekNumber: i + 1 })),
    );

    const r1 = await transitionWorkItem({ action: "claim", itemId: items[0].id, actor: editor });
    const r2 = await transitionWorkItem({ action: "claim", itemId: items[1].id, actor: editor });
    const r3 = await transitionWorkItem({ action: "claim", itemId: items[2].id, actor: editor });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("wip_limit");
  });

  it("requires a PPT link to submit a DLP item, but not a COT item", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const dlpItem = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    await transitionWorkItem({ action: "claim", itemId: dlpItem.id, actor: editor });

    const missingPpt = await transitionWorkItem({ action: "submit", itemId: dlpItem.id, actor: editor, dlpUrl: "https://x.test/dlp" });
    expect(missingPpt.ok).toBe(false);

    const withPpt = await transitionWorkItem({
      action: "submit",
      itemId: dlpItem.id,
      actor: editor,
      dlpUrl: "https://x.test/dlp",
      pptUrl: "https://x.test/ppt",
    });
    expect(withPpt.ok).toBe(true);

    const cotItem = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT", weekNumber: 2 });
    await transitionWorkItem({ action: "claim", itemId: cotItem.id, actor: editor });
    const cotSubmit = await transitionWorkItem({ action: "submit", itemId: cotItem.id, actor: editor, dlpUrl: "https://x.test/cot" });
    expect(cotSubmit.ok).toBe(true);
  });

  it("walks the full lifecycle: claim -> submit -> approve -> upload, logging every step", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT" });

    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, dlpUrl: "https://x.test/f" });
    const approved = await transitionWorkItem({ action: "approve", itemId: item.id, actor: admin });
    expect(approved.ok).toBe(true);
    const uploaded = await transitionWorkItem({ action: "upload", itemId: item.id, actor: admin });
    expect(uploaded.ok).toBe(true);
    if (uploaded.ok) expect(uploaded.item.status).toBe("uploaded");

    const events = await db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, item.id));
    expect(events.map((e) => e.toStatus)).toEqual(["claimed", "in_review", "approved", "uploaded"]);
    for (const event of events) {
      expect(event.actorId).not.toBeNull();
      expect(event.createdAt).toBeInstanceOf(Date);
    }
  });

  it("requires a note to request a revision, and returns the item to the same assignee", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT" });
    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, dlpUrl: "https://x.test/f" });

    const noNote = await transitionWorkItem({ action: "request_revision", itemId: item.id, actor: admin, note: "" });
    expect(noNote.ok).toBe(false);

    const result = await transitionWorkItem({ action: "request_revision", itemId: item.id, actor: admin, note: "Fix the title." });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.status).toBe("revision");
      expect(result.item.assigneeId).toBe(editor.id);
      expect(result.item.revisionCount).toBe(1);
    }
  });

  it("rejects a non-admin trying to approve or release", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });
    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, dlpUrl: "https://x.test/f", pptUrl: "https://x.test/p" });

    const approveAttempt = await transitionWorkItem({ action: "approve", itemId: item.id, actor: editor });
    expect(approveAttempt.ok).toBe(false);
    if (!approveAttempt.ok) expect(approveAttempt.error.code).toBe("forbidden");

    const releaseAttempt = await transitionWorkItem({ action: "release", itemId: item.id, actor: editor });
    expect(releaseAttempt.ok).toBe(false);
  });

  it("the natural-key unique constraint rejects a duplicate work item at the DB level", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    await makeWorkItem({ termId: term.id, subjectId: subject.id, grade: 4, weekNumber: 1, type: "DLP" });

    await expect(
      db.insert(workItems).values({
        termId: term.id,
        subjectId: subject.id,
        grade: 4,
        weekNumber: 1,
        type: "DLP",
        dueDate: "2099-01-01",
        pointsValue: "1",
      }),
    ).rejects.toThrow();
  });
});

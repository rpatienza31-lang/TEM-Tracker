import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { workItems, workItemEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteWorkItem, transitionWorkItem } from "@/lib/work-items/transitions";
import { quotaCycles } from "@/db/schema";
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

  it("requires a file link to submit, for every deliverable type", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });

    const missingLink = await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "" });
    expect(missingLink.ok).toBe(false);

    const withLink = await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/dlp" });
    expect(withLink.ok).toBe(true);
  });

  it("treats DLP, PPT, COT-DLP, and COT-PPT as four independently claimable items for the same subject/week", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editorA = await makeUser("editor", "Editor A");
    const editorB = await makeUser("editor", "Editor B");

    const dlp = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    const ppt = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "PPT" });
    const cotDlp = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT_DLP" });
    const cotPpt = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT_PPT" });

    expect(Number(dlp.pointsValue)).toBe(1);
    expect(Number(ppt.pointsValue)).toBe(1);
    expect(Number(cotDlp.pointsValue)).toBe(0.5);
    expect(Number(cotPpt.pointsValue)).toBe(0.5);

    // Different editors can claim the PPT and the COT-PPT for the same
    // subject/week independently of the DLP claim.
    const claimDlp = await transitionWorkItem({ action: "claim", itemId: dlp.id, actor: editorA });
    const claimPpt = await transitionWorkItem({ action: "claim", itemId: ppt.id, actor: editorB });
    const claimCotDlp = await transitionWorkItem({ action: "claim", itemId: cotDlp.id, actor: editorA });
    const claimCotPpt = await transitionWorkItem({ action: "claim", itemId: cotPpt.id, actor: editorB });

    expect(claimDlp.ok).toBe(true);
    expect(claimPpt.ok).toBe(true);
    expect(claimCotDlp.ok).toBe(true);
    expect(claimCotPpt.ok).toBe(true);
  });

  it("walks the full lifecycle: claim -> submit -> approve -> upload, logging every step", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT_DLP" });

    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });
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
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "COT_DLP" });
    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });

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
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });

    const approveAttempt = await transitionWorkItem({ action: "approve", itemId: item.id, actor: editor });
    expect(approveAttempt.ok).toBe(false);
    if (!approveAttempt.ok) expect(approveAttempt.error.code).toBe("forbidden");

    const releaseAttempt = await transitionWorkItem({ action: "release", itemId: item.id, actor: editor });
    expect(releaseAttempt.ok).toBe(false);
  });

  it("lets an admin delete a work item, and rejects a non-admin", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const admin = await makeUser("admin", "Admin One");
    const editor = await makeUser("editor", "Editor One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    const denied = await deleteWorkItem(item.id, editor);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("forbidden");

    const ok = await deleteWorkItem(item.id, admin);
    expect(ok.ok).toBe(true);

    const remaining = await db.select().from(workItems).where(eq(workItems.id, item.id));
    expect(remaining).toHaveLength(0);
  });

  it("reverses awarded points when an approved item is deleted", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const admin = await makeUser("admin", "Admin One");
    const editor = await makeUser("editor", "Editor One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });

    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });
    await transitionWorkItem({ action: "approve", itemId: item.id, actor: admin });

    const [before] = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editor.id));
    expect(Number(before.pointsTotal)).toBeGreaterThan(0);

    const result = await deleteWorkItem(item.id, admin);
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editor.id));
    expect(Number(after.pointsTotal)).toBe(0);
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

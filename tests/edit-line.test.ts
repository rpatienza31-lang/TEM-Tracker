import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { pointAdjustments, quotaCycleItems, quotaCycles, settings, workItems } from "@/db/schema";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import { editLinePoints, removeLine } from "@/lib/payroll/edit-line";
import { getPointsBreakdown } from "@/lib/payroll/breakdown";
import { getProductivityStats } from "@/lib/quota/productivity";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

const WIDE = { from: "2000-01-01", to: "2100-12-31" };

async function approve(itemId: string, editorId: string, adminId: string) {
  const editor = { id: editorId, role: "editor" } as never;
  const admin = { id: adminId, role: "admin" } as never;
  await transitionWorkItem({ action: "claim", itemId, actor: editor });
  await transitionWorkItem({ action: "submit", itemId, actor: editor, fileUrl: "https://x.test/f" });
  await transitionWorkItem({ action: "approve", itemId, actor: admin });
}

async function cyclesOf(editorId: string) {
  return db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editorId)).orderBy(quotaCycles.cycleNumber);
}

async function setQuota(size: number) {
  await db.update(settings).set({ value: size }).where(eq(settings.key, "quota_size"));
}

describe("editing a breakdown line's points", () => {
  let editorId: string;
  let adminId: string;
  let termId: string;
  let subjectId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const term = await makeTerm();
    const subject = await makeSubject();
    editorId = editor.id;
    adminId = admin.id;
    termId = term.id;
    subjectId = subject.id;
  });

  it("lowers a catalog line and reduces the cycle + period total (1.0 → 0.6)", async () => {
    const dlp = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    await approve(dlp.id, editorId, adminId);

    const res = await editLinePoints({ kind: "catalog", refId: dlp.id, newPoints: 0.6 });
    expect(res.ok).toBe(true);

    const [ledger] = await db.select().from(quotaCycleItems).where(eq(quotaCycleItems.workItemId, dlp.id));
    expect(Number(ledger.points)).toBe(0.6);
    const [wi] = await db.select().from(workItems).where(eq(workItems.id, dlp.id));
    expect(Number(wi.pointsAwarded)).toBe(0.6);

    const [open] = await cyclesOf(editorId);
    expect(Number(open.pointsTotal)).toBe(0.6);

    const stats = await getProductivityStats(WIDE);
    expect(stats.find((r) => r.editorId === editorId)!.totalPoints).toBe(0.6);
  });

  it("reopens a completed cycle when the edit drops it below target", async () => {
    await setQuota(2);
    const a = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    const b = await makeWorkItem({ termId, subjectId, weekNumber: 2, type: "DLP" });
    await approve(a.id, editorId, adminId);
    await approve(b.id, editorId, adminId); // cycle 1 hits target 2 → closes, cycle 2 opens at 0

    let cycles = await cyclesOf(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);

    // Drop one line to 0 → cycle 1 falls to 1 (< 2) and must reopen.
    const res = await editLinePoints({ kind: "catalog", refId: a.id, newPoints: 0 });
    expect(res.ok).toBe(true);

    cycles = await cyclesOf(editorId);
    expect(cycles[0].isClosed).toBe(false);
    expect(Number(cycles[0].pointsTotal)).toBe(1);
  });

  it("closes a cycle when the edit pushes it over target", async () => {
    await setQuota(2);
    const a = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    await approve(a.id, editorId, adminId); // open cycle at 1 (< 2)

    let cycles = await cyclesOf(editorId);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].isClosed).toBe(false);

    // Bump the line to 3 → crosses target 2, closes, carries 1 into a new cycle.
    const res = await editLinePoints({ kind: "catalog", refId: a.id, newPoints: 3 });
    expect(res.ok).toBe(true);

    cycles = await cyclesOf(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);
    expect(Number(cycles[1].pointsTotal)).toBe(1);
  });

  it("edits a manual adjustment line in place", async () => {
    await recordPointAdjustment({ editorId, points: 2, note: "Bonus" });
    const [adj] = await db
      .select()
      .from(pointAdjustments)
      .where(eq(pointAdjustments.editorId, editorId))
      .orderBy(desc(pointAdjustments.createdAt));

    const res = await editLinePoints({ kind: "adjustment", refId: adj.id, newPoints: 5 });
    expect(res.ok).toBe(true);

    const [updated] = await db.select().from(pointAdjustments).where(eq(pointAdjustments.id, adj.id));
    expect(Number(updated.points)).toBe(5);

    const [open] = await cyclesOf(editorId);
    expect(Number(open.pointsTotal)).toBe(5);
  });

  it("truly removes a catalog line so it disappears from the breakdown", async () => {
    const dlp = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    await approve(dlp.id, editorId, adminId);

    let lines = (await getPointsBreakdown("2000-01-01", "2100-12-31")).get(editorId) ?? [];
    expect(lines).toHaveLength(1);

    const res = await removeLine({ kind: "catalog", refId: dlp.id });
    expect(res.ok).toBe(true);

    lines = (await getPointsBreakdown("2000-01-01", "2100-12-31")).get(editorId) ?? [];
    expect(lines).toHaveLength(0); // gone, not offset

    const [open] = await cyclesOf(editorId);
    expect(Number(open.pointsTotal)).toBe(0);
  });

  it("truly removes a manual adjustment line", async () => {
    await recordPointAdjustment({ editorId, points: 3, note: "Bonus" });
    const { pointAdjustments } = await import("@/db/schema");
    const [adj] = await db.select().from(pointAdjustments).where(eq(pointAdjustments.editorId, editorId));

    const res = await removeLine({ kind: "adjustment", refId: adj.id });
    expect(res.ok).toBe(true);

    const remaining = await db.select().from(pointAdjustments).where(eq(pointAdjustments.editorId, editorId));
    expect(remaining).toHaveLength(0);
    const [open] = await cyclesOf(editorId);
    expect(Number(open.pointsTotal)).toBe(0);
  });

  it("rejects a negative value for a real project", async () => {
    const dlp = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "DLP" });
    await approve(dlp.id, editorId, adminId);
    const res = await editLinePoints({ kind: "catalog", refId: dlp.id, newPoints: -1 });
    expect(res.ok).toBe(false);
  });
});

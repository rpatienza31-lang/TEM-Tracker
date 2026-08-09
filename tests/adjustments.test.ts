import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { pointAdjustments, quotaCycles } from "@/db/schema";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getPointsBreakdown } from "@/lib/payroll/breakdown";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

async function openCycle(editorId: string) {
  const [c] = await db
    .select()
    .from(quotaCycles)
    .where(eq(quotaCycles.editorId, editorId))
    .orderBy(desc(quotaCycles.cycleNumber))
    .limit(1);
  return c;
}

async function productivityFor(editorId: string) {
  const rows = await getProductivityStats();
  return rows.find((r) => r.editorId === editorId)!;
}

const WIDE = { from: "2000-01-01", to: "2100-12-31" };

describe("manual point adjustments", () => {
  let editorId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    const editor = await makeUser("editor", "Editor One");
    editorId = editor.id;
  });

  it("adds points to the open cycle and records an audit row", async () => {
    await recordPointAdjustment({ editorId, points: 3, note: "Bonus" });

    const cycle = await openCycle(editorId);
    expect(Number(cycle.pointsTotal)).toBe(3);

    const [row] = await db.select().from(pointAdjustments).where(eq(pointAdjustments.editorId, editorId));
    expect(Number(row.points)).toBe(3);
    expect(row.note).toBe("Bonus");
    expect(row.cycleId).toBe(cycle.id);
  });

  it("counts adjustments in the editor's period points total", async () => {
    await recordPointAdjustment({ editorId, points: 4 });
    const stats = await productivityFor(editorId);
    expect(stats.adjustments).toBe(4);
    expect(stats.totalPoints).toBe(4);
  });

  it("shows the unpaid balance as the current cycle progress", async () => {
    await recordPointAdjustment({ editorId, points: 23 });
    // Nothing paid yet: all 23 are unpaid, building the 1st payout cycle.
    let stats = await productivityFor(editorId);
    expect(stats.totalPoints).toBe(23);
    expect(stats.pointsUnpaid).toBe(23);
    expect(stats.ledgerCycleNumber).toBe(1);
    expect(stats.ledgerCyclePoints).toBe(23);

    // Pay 22 → 1 unpaid, now building the 2nd payout cycle.
    const { recordPayrollPayment } = await import("@/lib/payroll/payments");
    await recordPayrollPayment({ editorId, points: 22, cycles: 1, amount: 2200, rate: 2100 });
    stats = await productivityFor(editorId);
    expect(stats.pointsPaid).toBe(22);
    expect(stats.pointsUnpaid).toBe(1);
    expect(stats.ledgerCycleNumber).toBe(2);
    expect(stats.ledgerCyclePoints).toBe(1);
  });

  it("subtracts for a negative adjustment, keeping the recorded amount and cycle in step", async () => {
    await recordPointAdjustment({ editorId, points: 5, note: "bump" });
    await recordPointAdjustment({ editorId, points: -2, note: "correction" });

    const cycle = await openCycle(editorId);
    expect(Number(cycle.pointsTotal)).toBe(3);

    const stats = await productivityFor(editorId);
    expect(stats.totalPoints).toBe(3); // 5 − 2
  });

  it("rolls the cycle over when a positive adjustment crosses the target", async () => {
    await recordPointAdjustment({ editorId, points: 23 }); // target is 21
    const cycles = await db
      .select()
      .from(quotaCycles)
      .where(eq(quotaCycles.editorId, editorId))
      .orderBy(quotaCycles.cycleNumber);

    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);
    expect(Number(cycles[1].pointsTotal)).toBe(2); // carried overflow
  });

  it("rejects nothing at the service layer but the breakdown lists each line and reconciles with the total", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const admin = await makeUser("admin", "Admin One");

    const dlp = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    const editorActor = { id: editorId, role: "editor" } as never;
    const adminActor = { id: admin.id, role: "admin" } as never;
    await transitionWorkItem({ action: "claim", itemId: dlp.id, actor: editorActor });
    await transitionWorkItem({ action: "submit", itemId: dlp.id, actor: editorActor, fileUrl: "https://x.test/f" });
    await transitionWorkItem({ action: "approve", itemId: dlp.id, actor: adminActor });

    await recordPointAdjustment({ editorId, points: 2, note: "Bonus" });

    const breakdown = await getPointsBreakdown(WIDE.from, WIDE.to);
    const lines = breakdown.get(editorId)!;
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.kind === "catalog" && l.points === 1)).toBe(true);
    expect(lines.some((l) => l.kind === "adjustment" && l.points === 2 && l.subtitle === "Bonus")).toBe(true);

    const sum = lines.reduce((s, l) => s + l.points, 0);
    const stats = await getProductivityStats(WIDE);
    expect(sum).toBe(stats.find((r) => r.editorId === editorId)!.totalPoints); // 1 + 2 = 3
  });

  it("nets a removed project back out via a compensating correction", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const admin = await makeUser("admin", "Admin Two");

    const dlp = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    const editorActor = { id: editorId, role: "editor" } as never;
    const adminActor = { id: admin.id, role: "admin" } as never;
    await transitionWorkItem({ action: "claim", itemId: dlp.id, actor: editorActor });
    await transitionWorkItem({ action: "submit", itemId: dlp.id, actor: editorActor, fileUrl: "https://x.test/f" });
    await transitionWorkItem({ action: "approve", itemId: dlp.id, actor: adminActor });

    // Owner removes the wrongly-counted project: a compensating −1 is recorded.
    await recordPointAdjustment({ editorId, points: -1, note: "Removed: DLP — Grade 4 · Test Subject · Week 1" });

    const stats = await getProductivityStats(WIDE);
    const mine = stats.find((r) => r.editorId === editorId)!;
    expect(mine.totalPoints).toBe(0); // +1 catalog, −1 removal

    const lines = (await getPointsBreakdown(WIDE.from, WIDE.to)).get(editorId)!;
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.points, 0)).toBe(0);
  });
});

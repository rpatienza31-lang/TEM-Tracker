import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { timeLogs } from "@/db/schema";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getPayrollReport } from "@/lib/payroll/report";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

const RANGE = { from: "2020-01-01", to: "2020-01-31" };

async function approve(itemId: string, editor: { id: string }, admin: { id: string }) {
  const editorActor = { id: editor.id, role: "editor" } as never;
  const adminActor = { id: admin.id, role: "admin" } as never;
  await transitionWorkItem({ action: "claim", itemId, actor: editorActor });
  await transitionWorkItem({ action: "submit", itemId, actor: editorActor, fileUrl: "https://x.test/f" });
  return transitionWorkItem({ action: "approve", itemId, actor: adminActor });
}

describe("payroll report", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("reconciles exactly with the productivity screen for the same period", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");

    const dlp = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "DLP" });
    const ppt = await makeWorkItem({ termId: term.id, subjectId: subject.id, type: "PPT" });
    await approve(dlp.id, editor, admin);
    await approve(ppt.id, editor, admin);

    // Backdate the awards into the reporting period so the CSV isn't empty
    // (approvals default to "now", which vitest runs outside the fixed range).
    const { quotaCycleItems } = await import("@/db/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    await db.update(quotaCycleItems).set({ awardedAt: new Date("2020-01-15") }).where(eqOp(quotaCycleItems.workItemId, dlp.id));
    await db.update(quotaCycleItems).set({ awardedAt: new Date("2020-01-16") }).where(eqOp(quotaCycleItems.workItemId, ppt.id));

    const [productivity] = await getProductivityStats(RANGE);
    const report = await getPayrollReport(RANGE.from, RANGE.to);
    const payrollRow = report.quotaRows.find((r) => r.userId === editor.id);

    expect(productivity.editorId).toBe(editor.id);
    expect(productivity.totalPoints).toBe(2);
    expect(payrollRow).toBeDefined();
    expect(payrollRow!.pointsEarned).toBe(productivity.totalPoints);
  });

  it("only includes approved time logs in hourly totals", async () => {
    const admin = await makeUser("admin", "Admin Hourly");

    await db.insert(timeLogs).values([
      { userId: admin.id, workDate: "2020-01-10", hours: "8", approvedBy: admin.id, approvedAt: new Date() },
      { userId: admin.id, workDate: "2020-01-11", hours: "5" }, // not approved
    ]);

    const report = await getPayrollReport(RANGE.from, RANGE.to);
    const row = report.hourlyRows.find((r) => r.userId === admin.id);

    expect(row).toBeDefined();
    expect(row!.approvedHours).toBe(8);
  });
});

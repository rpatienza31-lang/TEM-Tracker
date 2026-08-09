import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { timeLogs, users } from "@/db/schema";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getPayrollReport, payrollReportToCsv } from "@/lib/payroll/report";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import { recordPayrollPayment } from "@/lib/payroll/payments";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

const RANGE = { from: "2020-01-01", to: "2020-01-31" };
// Manual adjustments are stamped "now", so tests that use them read over a
// range that spans the present.
const WIDE = { from: "2000-01-01", to: "2100-12-31" };

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

  it("pays quota staff pro-rated per point, exceeded points included", async () => {
    const editor = await makeUser("editor", "Quota Paid");
    await db.update(users).set({ cycleRate: "3500.00" }).where(eq(users.id, editor.id)); // ₱3500/21 = ₱166.67/pt

    // 22 points: quota reached with 1 exceeded point, all paid pro-rated.
    for (let i = 0; i < 22; i++) await recordPointAdjustment({ editorId: editor.id, points: 1, note: `p${i}` });

    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.pointsEarned).toBe(22);
    expect(row.completedCycles).toBe(1);
    expect(row.quotaReached).toBe(true);
    expect(row.remainderCarried).toBe(1);
    expect(row.perSubjectRate).toBeCloseTo(166.67, 2);
    expect(row.salary).toBeCloseTo(3666.67, 1); // 22 × ₱166.67

    const slip = report.payslips.find((p) => p.userId === editor.id);
    expect(slip!.gross).toBeCloseTo(3666.67, 1);
  });

  it("pays a partial cycle pro-rated and flags quota not reached", async () => {
    const editor = await makeUser("editor", "Partial Cycle");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id)); // ₱100/pt
    for (let i = 0; i < 14; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });

    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.quotaReached).toBe(false);
    expect(row.completedCycles).toBe(0);
    expect(row.salary).toBe(1400); // 14 × ₱100
  });

  it("settles the unpaid balance on payment, so new approvals start a fresh count", async () => {
    const editor = await makeUser("editor", "Paid Once");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));
    for (let i = 0; i < 22; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });

    let report = await getPayrollReport(WIDE.from, WIDE.to);
    let row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.pointsUnpaid).toBe(22);
    expect(row.isPaid).toBe(false);

    await recordPayrollPayment({
      editorId: editor.id,
      points: row.pointsUnpaid,
      cycles: row.completedCycles,
      amount: row.salary,
      rate: row.rate,
      from: WIDE.from,
      to: WIDE.to,
    });

    report = await getPayrollReport(WIDE.from, WIDE.to);
    row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.pointsPaid).toBe(22);
    expect(row.pointsUnpaid).toBe(0);
    expect(row.isPaid).toBe(true);
    expect(row.salary).toBe(0);

    // Approve one more subject: it reads as a fresh unpaid point, not 23.
    await recordPointAdjustment({ editorId: editor.id, points: 1 });
    report = await getPayrollReport(WIDE.from, WIDE.to);
    row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.pointsEarned).toBe(23); // total still tracked
    expect(row.pointsUnpaid).toBe(1); // but only 1 is outstanding
    expect(row.quotaReached).toBe(false); // new cycle, quota not reached again
    expect(row.isPaid).toBe(false);
    expect(row.salary).toBe(100); // 1 × ₱100
  });

  it("shows the same unpaid balance on the dashboard (productivity) and payroll", async () => {
    const editor = await makeUser("editor", "In Sync");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));
    for (let i = 0; i < 23; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });
    // Pay 22 (one cycle + 1), leaving 1 unpaid.
    await recordPayrollPayment({ editorId: editor.id, points: 22, cycles: 1, amount: 2200, rate: 2100 });

    const [stat] = (await getProductivityStats()).filter((r) => r.editorId === editor.id);
    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;

    expect(stat.pointsUnpaid).toBe(1); // dashboard
    expect(row.pointsUnpaid).toBe(1); // payroll — same number
    expect(stat.ledgerCyclePoints).toBe(1); // leaderboard progress = unpaid
    expect(stat.ledgerCycleNumber).toBe(2); // building the 2nd payout cycle
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

  it("computes hourly salary from the staff rate and totals it", async () => {
    const staff = await makeUser("admin", "Hourly Rate");
    await db.update(users).set({ hourlyRate: "50.00" }).where(eq(users.id, staff.id));

    await db.insert(timeLogs).values([
      { userId: staff.id, workDate: "2020-01-10", hours: "8", approvedBy: staff.id, approvedAt: new Date() },
    ]);

    const report = await getPayrollReport(RANGE.from, RANGE.to);
    const row = report.hourlyRows.find((r) => r.userId === staff.id);

    expect(row!.rate).toBe(50);
    expect(row!.salary).toBe(400); // 8 hours * ₱50
    expect(report.totalSalary).toBe(400);
  });

  it("includes 'both' staff in the hourly section, paid from their hourly rate", async () => {
    const staff = await makeUser("editor", "Both Staff"); // editor default payType is quota
    await db.update(users).set({ payType: "both", hourlyRate: "40.00" }).where(eq(users.id, staff.id));
    await db.insert(timeLogs).values([
      { userId: staff.id, workDate: "2020-01-10", hours: "5", approvedBy: staff.id, approvedAt: new Date() },
    ]);

    const report = await getPayrollReport(RANGE.from, RANGE.to);
    const row = report.hourlyRows.find((r) => r.userId === staff.id);
    expect(row).toBeDefined();
    expect(row!.salary).toBe(200); // 5 hours * ₱40
  });

  it("builds a payslip with the cash advance deducted from gross", async () => {
    const staff = await makeUser("admin", "Payslip Staff");
    await db.update(users).set({ hourlyRate: "50.00", cashAdvance: "100.00" }).where(eq(users.id, staff.id));
    await db.insert(timeLogs).values([
      { userId: staff.id, workDate: "2020-01-10", hours: "8", approvedBy: staff.id, approvedAt: new Date() },
    ]);

    const report = await getPayrollReport(RANGE.from, RANGE.to);
    const slip = report.payslips.find((p) => p.userId === staff.id);
    expect(slip).toBeDefined();
    expect(slip!.gross).toBe(400); // 8h * ₱50
    expect(slip!.cashAdvance).toBe(100);
    expect(slip!.net).toBe(300); // 400 − 100
  });

  it("omits salary and rate columns from the CSV unless salary is included", async () => {
    const staff = await makeUser("admin", "Csv Staff");
    await db.update(users).set({ hourlyRate: "50.00" }).where(eq(users.id, staff.id));
    await db.insert(timeLogs).values([
      { userId: staff.id, workDate: "2020-01-10", hours: "8", approvedBy: staff.id, approvedAt: new Date() },
    ]);

    const report = await getPayrollReport(RANGE.from, RANGE.to);

    const withoutSalary = payrollReportToCsv(report);
    expect(withoutSalary).not.toContain("Salary");
    expect(withoutSalary).not.toContain("Total salary");

    const withSalary = payrollReportToCsv(report, true);
    expect(withSalary).toContain("Rate per hour,Salary");
    expect(withSalary).toContain("Total salary,400.00");
  });
});

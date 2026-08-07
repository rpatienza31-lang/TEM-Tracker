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

  it("pays quota staff for whole completed cycles from points earned", async () => {
    const editor = await makeUser("editor", "Quota Paid");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));

    // 22 points = one complete 21-point cycle, with 1 point carried.
    for (let i = 0; i < 22; i++) await recordPointAdjustment({ editorId: editor.id, points: 1, note: `p${i}` });

    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.pointsEarned).toBe(22);
    expect(row.completedCycles).toBe(1);
    expect(row.unpaidCycles).toBe(1);
    expect(row.remainderCarried).toBe(1);
    expect(row.salary).toBe(2100); // 1 whole cycle × ₱2100

    const slip = report.payslips.find((p) => p.userId === editor.id);
    expect(slip!.gross).toBe(2100);
  });

  it("does not pay a partial cycle; it carries the remainder", async () => {
    const editor = await makeUser("editor", "Partial Cycle");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));
    for (let i = 0; i < 14; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });

    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.completedCycles).toBe(0);
    expect(row.unpaidCycles).toBe(0);
    expect(row.salary).toBe(0);
    expect(row.remainderCarried).toBe(14);
  });

  it("never pays the same cycle twice once it is marked paid", async () => {
    const editor = await makeUser("editor", "Paid Once");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));
    for (let i = 0; i < 21; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });

    let report = await getPayrollReport(WIDE.from, WIDE.to);
    expect(report.quotaRows.find((r) => r.userId === editor.id)!.unpaidCycles).toBe(1);

    await recordPayrollPayment({ editorId: editor.id, cycles: 1, rate: 2100, quotaSize: 21, from: WIDE.from, to: WIDE.to });

    report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.cyclesPaid).toBe(1);
    expect(row.unpaidCycles).toBe(0);
    expect(row.salary).toBe(0);
    expect(row.lastPaidAt).not.toBeNull();

    // Earning one more full cycle makes exactly one new cycle payable.
    for (let i = 0; i < 21; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });
    report = await getPayrollReport(WIDE.from, WIDE.to);
    const row2 = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row2.completedCycles).toBe(2);
    expect(row2.unpaidCycles).toBe(1);
    expect(row2.salary).toBe(2100);
  });

  it("scopes 'paid' to the period, so a payment in one period doesn't hide another", async () => {
    const editor = await makeUser("editor", "Two Periods");
    await db.update(users).set({ cycleRate: "2100.00" }).where(eq(users.id, editor.id));
    for (let i = 0; i < 21; i++) await recordPointAdjustment({ editorId: editor.id, points: 1 });

    // Paid against a DIFFERENT period than the one we then view.
    await recordPayrollPayment({ editorId: editor.id, cycles: 1, rate: 2100, quotaSize: 21, from: "1999-01-01", to: "1999-01-31" });

    const report = await getPayrollReport(WIDE.from, WIDE.to);
    const row = report.quotaRows.find((r) => r.userId === editor.id)!;
    expect(row.cyclesPaid).toBe(0); // that other period's payment doesn't count here
    expect(row.unpaidCycles).toBe(1);
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

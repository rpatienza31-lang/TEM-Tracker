import { asc, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getQuotaSize } from "@/lib/settings";
import { getPaymentsForPeriod } from "@/lib/payroll/payments";
import { getApprovedHoursForPeriod } from "@/lib/time-logs/queries";

export type QuotaPayrollRow = {
  userId: string;
  fullName: string;
  // The cycle the editor is currently on (includes the owner reconciliation baseline).
  cycleNumber: number;
  // Total points earned within this payroll period (all projects; the breakdown).
  pointsEarned: number;
  // Points already settled by a recorded payout this period.
  pointsPaid: number;
  // Outstanding points still to pay: pointsEarned − pointsPaid. Resets toward
  // zero after a payout, so new approvals read as a fresh cycle.
  pointsUnpaid: number;
  // Whole 21-point cycles in the unpaid balance (monitoring): floor(unpaid / quota).
  completedCycles: number;
  // Whether the unpaid balance has reached one full cycle.
  quotaReached: boolean;
  // Points into the current (incomplete) cycle of the unpaid balance.
  remainderCarried: number;
  // The per-cycle rate, and the per-subject (per-point) rate derived from it.
  rate: number;
  perSubjectRate: number;
  // Points actually payable this payout: capped to one full cycle when the
  // unpaid balance is over quota (the rest carries to the next cycle).
  pointsPayable: number;
  // Points carried to the next cycle when the balance is over one cycle
  // (pointsUnpaid − pointsPayable); zero when under quota.
  pointsCarried: number;
  // Pro-rated pay on the payable points: pointsPayable × (rate / quota),
  // i.e. capped to one cycle (21 pts) when over quota.
  salary: number;
  // Whether everything earned this period has been paid, and when it was last paid.
  isPaid: boolean;
  lastPaidAt: string | null;
};

export type HourlyPayrollRow = {
  userId: string;
  fullName: string;
  // Cumulative approved hours as of the period end.
  approvedHours: number;
  // Hours already paid (lifetime watermark) and the unpaid balance still owed.
  hoursPaid: number;
  hoursUnpaid: number;
  rate: number;
  // hoursUnpaid × rate.
  salary: number;
  isPaid: boolean;
  lastPaidAt: string | null;
};

export type PayslipRow = {
  userId: string;
  fullName: string;
  quotaSalary: number;
  hourlySalary: number;
  // Points held back to the next cycle because this payout is capped to one
  // full cycle (0 when under quota). Purely informational for the summary.
  quotaCarried: number;
  gross: number;
  cashAdvance: number;
  net: number;
};

export type PayrollReport = {
  from: string;
  to: string;
  quotaRows: QuotaPayrollRow[];
  hourlyRows: HourlyPayrollRow[];
  payslips: PayslipRow[];
  totalSalary: number;
  totalNet: number;
};

/**
 * Assembles the payroll report for a date range (spec §7.7 / §9 Phase 3).
 * Quota-staff numbers are derived from the same quota_cycles/
 * quota_cycle_items rows the Productivity screen reads, so the two always
 * reconcile. Hourly totals only ever include approved time logs.
 */
export async function getPayrollReport(from: string, to: string): Promise<PayrollReport> {
  const [productivity, quotaSize, hourlyPayments, approvedHours, hourlyStaff, rateRows] = await Promise.all([
    // Cumulative points as of the period end; the unpaid balance (points −
    // lifetime paid) is what's owed, matching the dashboard.
    getProductivityStats({ to }),
    getQuotaSize(),
    // Hourly is settled per period (weekly timesheet), so it tracks the date
    // filter: approved hours and paid hours are both scoped to [from, to].
    getPaymentsForPeriod("hourly", from, to),
    getApprovedHoursForPeriod(from, to),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.payType, ["hourly", "both"]))
      .orderBy(asc(users.fullName)),
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        hourlyRate: users.hourlyRate,
        cycleRate: users.cycleRate,
        cashAdvance: users.cashAdvance,
      })
      .from(users),
  ]);

  const hourlyRateByUser = new Map(rateRows.map((r) => [r.id, Number(r.hourlyRate)]));
  const cycleRateByUser = new Map(rateRows.map((r) => [r.id, Number(r.cycleRate)]));
  const cashAdvanceByUser = new Map(rateRows.map((r) => [r.id, Number(r.cashAdvance)]));
  const nameByUser = new Map(rateRows.map((r) => [r.id, r.fullName]));
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Quota pay is pro-rated per point on the UNPAID balance: unpaid × (rate /
  // quota). The unpaid balance (points earned − lifetime paid) comes straight
  // from the productivity stats, so payroll and the dashboard show the same
  // number. After a payout the balance resets toward zero.
  const quotaRows: QuotaPayrollRow[] = productivity.map((p) => {
    const rate = cycleRateByUser.get(p.editorId) ?? 0;
    const perSubjectRate = quotaSize > 0 ? rate / quotaSize : 0;
    const pointsUnpaid = p.pointsUnpaid;
    const completedCycles = quotaSize > 0 ? Math.floor(pointsUnpaid / quotaSize) : 0;
    const remainderCarried = round2(pointsUnpaid - completedCycles * quotaSize);
    // Policy: pay one full cycle at a time. When the unpaid balance is over
    // quota, this payout covers a single cycle (21 pts) and the rest carries to
    // the next cycle. Under quota, pay the whole balance.
    const pointsPayable = quotaSize > 0 ? Math.min(pointsUnpaid, quotaSize) : pointsUnpaid;
    const pointsCarried = round2(Math.max(0, pointsUnpaid - pointsPayable));
    return {
      userId: p.editorId,
      fullName: p.fullName,
      cycleNumber: p.ledgerCycleNumber,
      pointsEarned: p.totalPoints,
      pointsPaid: p.pointsPaid,
      pointsUnpaid,
      completedCycles,
      quotaReached: completedCycles >= 1,
      remainderCarried,
      rate,
      perSubjectRate: round2(perSubjectRate),
      pointsPayable,
      pointsCarried,
      salary: round2(pointsPayable * perSubjectRate),
      isPaid: pointsUnpaid <= 0 && p.pointsPaid > 0,
      lastPaidAt: p.lastPaidAt,
    };
  });

  const hoursByUser = new Map(approvedHours.map((h) => [h.userId, h.hours]));
  // Hourly pay: pay the UNPAID hours for the period (approved − already paid for
  // this period), so it matches the selected date filter and isn't paid twice.
  const hourlyRows: HourlyPayrollRow[] = hourlyStaff.map((u) => {
    const approvedHrs = hoursByUser.get(u.id) ?? 0;
    const rate = hourlyRateByUser.get(u.id) ?? 0;
    const summary = hourlyPayments.get(u.id);
    const hoursPaid = summary?.pointsPaid ?? 0;
    const hoursUnpaid = round2(Math.max(0, approvedHrs - hoursPaid));
    return {
      userId: u.id,
      fullName: u.fullName,
      approvedHours: approvedHrs,
      hoursPaid,
      hoursUnpaid,
      rate,
      salary: round2(hoursUnpaid * rate),
      isPaid: hoursUnpaid <= 0 && hoursPaid > 0,
      lastPaidAt: summary?.lastPaidAt ? new Date(summary.lastPaidAt).toISOString() : null,
    };
  });

  const totalSalary =
    quotaRows.reduce((sum, r) => sum + r.salary, 0) + hourlyRows.reduce((sum, r) => sum + r.salary, 0);

  // One payslip per staff member with any earnings or cash advance, combining
  // their quota and hourly pay, less the cash advance to deduct this payout.
  const bySalary = new Map<string, { quota: number; hourly: number; quotaCarried: number }>();
  for (const r of quotaRows) {
    const e = bySalary.get(r.userId) ?? { quota: 0, hourly: 0, quotaCarried: 0 };
    e.quota += r.salary;
    e.quotaCarried += r.pointsCarried;
    bySalary.set(r.userId, e);
  }
  for (const r of hourlyRows) {
    const e = bySalary.get(r.userId) ?? { quota: 0, hourly: 0, quotaCarried: 0 };
    e.hourly += r.salary;
    bySalary.set(r.userId, e);
  }
  const payslipUserIds = new Set<string>([...bySalary.keys()]);
  for (const [id, ca] of cashAdvanceByUser) if (ca > 0) payslipUserIds.add(id);

  const payslips: PayslipRow[] = [...payslipUserIds]
    .map((userId) => {
      const e = bySalary.get(userId) ?? { quota: 0, hourly: 0, quotaCarried: 0 };
      const gross = e.quota + e.hourly;
      const cashAdvance = cashAdvanceByUser.get(userId) ?? 0;
      return {
        userId,
        fullName: nameByUser.get(userId) ?? "",
        quotaSalary: e.quota,
        hourlySalary: e.hourly,
        quotaCarried: round2(e.quotaCarried),
        gross,
        cashAdvance,
        net: gross - cashAdvance,
      };
    })
    .filter((p) => p.gross > 0 || p.cashAdvance > 0)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const totalNet = payslips.reduce((sum, p) => sum + p.net, 0);

  return { from, to, quotaRows, hourlyRows, payslips, totalSalary, totalNet };
}

/**
 * Renders the report to CSV. Salary and rate columns are included only when
 * `includeSalary` is true — the export route passes this based on the
 * viewer's role so peso amounts stay owner-only.
 */
export function payrollReportToCsv(report: PayrollReport, includeSalary = false): string {
  const lines: string[] = [];
  lines.push(`Payroll period,${report.from},${report.to}`);
  lines.push("");
  lines.push("Quota staff");
  lines.push(
    includeSalary
      ? "Name,Points earned,Paid,Unpaid,Quota reached,Rate per subject,Salary,Status"
      : "Name,Points earned,Paid,Unpaid,Quota reached",
  );
  for (const row of report.quotaRows) {
    const base = [
      row.fullName,
      row.pointsEarned.toFixed(2),
      row.pointsPaid.toFixed(2),
      row.pointsUnpaid.toFixed(2),
      row.quotaReached ? "Yes" : "No",
    ];
    if (includeSalary) base.push(row.perSubjectRate.toFixed(2), row.salary.toFixed(2), row.isPaid ? "Paid" : "");
    lines.push(base.join(","));
  }
  lines.push("");
  lines.push("Hourly staff");
  lines.push(includeSalary ? "Name,Approved hours,Rate per hour,Salary" : "Name,Approved hours");
  for (const row of report.hourlyRows) {
    const base = [row.fullName, row.approvedHours.toFixed(2)];
    if (includeSalary) base.push(row.rate.toFixed(2), row.salary.toFixed(2));
    lines.push(base.join(","));
  }
  if (includeSalary) {
    lines.push("");
    lines.push(`Total salary,${report.totalSalary.toFixed(2)}`);
  }
  return lines.join("\n");
}

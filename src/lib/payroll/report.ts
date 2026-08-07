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
  // Points earned within this payroll period.
  pointsEarned: number;
  // Whole 21-point cycles completed this period: floor(pointsEarned / quotaSize).
  completedCycles: number;
  // Whole cycles already paid FOR this period.
  cyclesPaid: number;
  // Completed cycles not yet paid — what this payout covers.
  unpaidCycles: number;
  // Points into the current (incomplete) cycle: pointsEarned − completed × quota.
  remainderCarried: number;
  rate: number;
  // unpaidCycles × rate — pay for whole unpaid cycles only.
  salary: number;
  // ISO timestamp of the last payout, or null if never paid.
  lastPaidAt: string | null;
};

export type HourlyPayrollRow = {
  userId: string;
  fullName: string;
  approvedHours: number;
  rate: number;
  salary: number;
};

export type PayslipRow = {
  userId: string;
  fullName: string;
  quotaSalary: number;
  hourlySalary: number;
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
  const [productivity, quotaSize, paymentSummary, approvedHours, hourlyStaff, rateRows] = await Promise.all([
    getProductivityStats({ from, to }),
    getQuotaSize(),
    getPaymentsForPeriod(from, to),
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

  // Quota pay: every whole `quotaSize`-point cycle earned this period is owed,
  // less any already paid FOR this period, so a partial cycle is never paid and
  // a period is never paid twice.
  const quotaRows: QuotaPayrollRow[] = productivity.map((p) => {
    const rate = cycleRateByUser.get(p.editorId) ?? 0;
    const points = p.totalPoints;
    const completedCycles = quotaSize > 0 ? Math.floor(points / quotaSize) : 0;
    const summary = paymentSummary.get(p.editorId);
    const cyclesPaid = summary?.cyclesPaid ?? 0;
    const unpaidCycles = Math.max(0, completedCycles - cyclesPaid);
    const remainderCarried = round2(points - completedCycles * quotaSize);
    return {
      userId: p.editorId,
      fullName: p.fullName,
      pointsEarned: points,
      completedCycles,
      cyclesPaid,
      unpaidCycles,
      remainderCarried,
      rate,
      salary: round2(unpaidCycles * rate),
      lastPaidAt: summary?.lastPaidAt ? new Date(summary.lastPaidAt).toISOString() : null,
    };
  });

  const hoursByUser = new Map(approvedHours.map((h) => [h.userId, h.hours]));
  const hourlyRows: HourlyPayrollRow[] = hourlyStaff.map((u) => {
    const approvedHrs = hoursByUser.get(u.id) ?? 0;
    const rate = hourlyRateByUser.get(u.id) ?? 0;
    return {
      userId: u.id,
      fullName: u.fullName,
      approvedHours: approvedHrs,
      rate,
      salary: approvedHrs * rate,
    };
  });

  const totalSalary =
    quotaRows.reduce((sum, r) => sum + r.salary, 0) + hourlyRows.reduce((sum, r) => sum + r.salary, 0);

  // One payslip per staff member with any earnings or cash advance, combining
  // their quota and hourly pay, less the cash advance to deduct this payout.
  const bySalary = new Map<string, { quota: number; hourly: number }>();
  for (const r of quotaRows) {
    const e = bySalary.get(r.userId) ?? { quota: 0, hourly: 0 };
    e.quota += r.salary;
    bySalary.set(r.userId, e);
  }
  for (const r of hourlyRows) {
    const e = bySalary.get(r.userId) ?? { quota: 0, hourly: 0 };
    e.hourly += r.salary;
    bySalary.set(r.userId, e);
  }
  const payslipUserIds = new Set<string>([...bySalary.keys()]);
  for (const [id, ca] of cashAdvanceByUser) if (ca > 0) payslipUserIds.add(id);

  const payslips: PayslipRow[] = [...payslipUserIds]
    .map((userId) => {
      const e = bySalary.get(userId) ?? { quota: 0, hourly: 0 };
      const gross = e.quota + e.hourly;
      const cashAdvance = cashAdvanceByUser.get(userId) ?? 0;
      return {
        userId,
        fullName: nameByUser.get(userId) ?? "",
        quotaSalary: e.quota,
        hourlySalary: e.hourly,
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
      ? "Name,Points,Completed cycles,Paid,Unpaid,Remainder,Rate per cycle,Salary due"
      : "Name,Points,Completed cycles,Paid,Unpaid,Remainder",
  );
  for (const row of report.quotaRows) {
    const base = [
      row.fullName,
      row.pointsEarned.toFixed(2),
      String(row.completedCycles),
      String(row.cyclesPaid),
      String(row.unpaidCycles),
      row.remainderCarried.toFixed(2),
    ];
    if (includeSalary) base.push(row.rate.toFixed(2), row.salary.toFixed(2));
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

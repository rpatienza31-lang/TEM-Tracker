import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getCyclesClosedInPeriod } from "@/lib/quota/cycles";
import { getApprovedHoursForPeriod } from "@/lib/time-logs/queries";

export type QuotaPayrollRow = {
  userId: string;
  fullName: string;
  cyclesCompleted: number;
  pointsEarned: number;
  remainderCarried: number;
  rate: number;
  salary: number;
};

export type HourlyPayrollRow = {
  userId: string;
  fullName: string;
  approvedHours: number;
  rate: number;
  salary: number;
};

export type PayrollReport = {
  from: string;
  to: string;
  quotaRows: QuotaPayrollRow[];
  hourlyRows: HourlyPayrollRow[];
  totalSalary: number;
};

/**
 * Assembles the payroll report for a date range (spec §7.7 / §9 Phase 3).
 * Quota-staff numbers are derived from the same quota_cycles/
 * quota_cycle_items rows the Productivity screen reads, so the two always
 * reconcile. Hourly totals only ever include approved time logs.
 */
export async function getPayrollReport(from: string, to: string): Promise<PayrollReport> {
  const [productivity, closures, approvedHours, hourlyStaff, rateRows] = await Promise.all([
    getProductivityStats({ from, to }),
    getCyclesClosedInPeriod(from, to),
    getApprovedHoursForPeriod(from, to),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.payType, "hourly"))
      .orderBy(asc(users.fullName)),
    db.select({ id: users.id, rate: users.rate }).from(users),
  ]);

  const closuresByEditor = new Map(closures.map((c) => [c.editorId, c]));
  const rateByUser = new Map(rateRows.map((r) => [r.id, Number(r.rate)]));

  const quotaRows: QuotaPayrollRow[] = productivity.map((p) => {
    const closure = closuresByEditor.get(p.editorId);
    const cyclesCompleted = closure?.cyclesCompleted ?? 0;
    const rate = rateByUser.get(p.editorId) ?? 0;
    return {
      userId: p.editorId,
      fullName: p.fullName,
      cyclesCompleted,
      pointsEarned: p.totalPoints,
      remainderCarried: closure?.remainderCarried ?? 0,
      rate,
      salary: cyclesCompleted * rate,
    };
  });

  const hoursByUser = new Map(approvedHours.map((h) => [h.userId, h.hours]));
  const hourlyRows: HourlyPayrollRow[] = hourlyStaff.map((u) => {
    const approvedHrs = hoursByUser.get(u.id) ?? 0;
    const rate = rateByUser.get(u.id) ?? 0;
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

  return { from, to, quotaRows, hourlyRows, totalSalary };
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
      ? "Name,Cycles completed,Points earned,Remainder carried,Rate per cycle,Salary"
      : "Name,Cycles completed,Points earned,Remainder carried",
  );
  for (const row of report.quotaRows) {
    const base = [row.fullName, row.cyclesCompleted, row.pointsEarned.toFixed(2), row.remainderCarried.toFixed(2)];
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

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
};

export type HourlyPayrollRow = {
  userId: string;
  fullName: string;
  approvedHours: number;
};

export type PayrollReport = {
  from: string;
  to: string;
  quotaRows: QuotaPayrollRow[];
  hourlyRows: HourlyPayrollRow[];
};

/**
 * Assembles the payroll report for a date range (spec §7.7 / §9 Phase 3).
 * Quota-staff numbers are derived from the same quota_cycles/
 * quota_cycle_items rows the Productivity screen reads, so the two always
 * reconcile. Hourly totals only ever include approved time logs.
 */
export async function getPayrollReport(from: string, to: string): Promise<PayrollReport> {
  const [productivity, closures, approvedHours, hourlyStaff] = await Promise.all([
    getProductivityStats({ from, to }),
    getCyclesClosedInPeriod(from, to),
    getApprovedHoursForPeriod(from, to),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.payType, "hourly"))
      .orderBy(asc(users.fullName)),
  ]);

  const closuresByEditor = new Map(closures.map((c) => [c.editorId, c]));

  const quotaRows: QuotaPayrollRow[] = productivity.map((p) => {
    const closure = closuresByEditor.get(p.editorId);
    return {
      userId: p.editorId,
      fullName: p.fullName,
      cyclesCompleted: closure?.cyclesCompleted ?? 0,
      pointsEarned: p.totalPoints,
      remainderCarried: closure?.remainderCarried ?? 0,
    };
  });

  const hoursByUser = new Map(approvedHours.map((h) => [h.userId, h.hours]));
  const hourlyRows: HourlyPayrollRow[] = hourlyStaff.map((u) => ({
    userId: u.id,
    fullName: u.fullName,
    approvedHours: hoursByUser.get(u.id) ?? 0,
  }));

  return { from, to, quotaRows, hourlyRows };
}

export function payrollReportToCsv(report: PayrollReport): string {
  const lines: string[] = [];
  lines.push(`Payroll period,${report.from},${report.to}`);
  lines.push("");
  lines.push("Quota staff");
  lines.push("Name,Cycles completed,Points earned,Remainder carried");
  for (const row of report.quotaRows) {
    lines.push([row.fullName, row.cyclesCompleted, row.pointsEarned.toFixed(2), row.remainderCarried.toFixed(2)].join(","));
  }
  lines.push("");
  lines.push("Hourly staff");
  lines.push("Name,Approved hours");
  for (const row of report.hourlyRows) {
    lines.push([row.fullName, row.approvedHours.toFixed(2)].join(","));
  }
  return lines.join("\n");
}

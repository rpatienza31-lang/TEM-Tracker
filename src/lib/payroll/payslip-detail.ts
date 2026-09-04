import { getPointsBreakdown } from "@/lib/payroll/breakdown";
import { splitPaidUnpaid } from "@/lib/payroll/paid-split";
import { getApprovedTimeLogsForPeriod } from "@/lib/time-logs/queries";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";
import type { PayslipItem, PayslipSession } from "@/lib/payroll/payslip-html";
import type { QuotaPayrollRow, HourlyPayrollRow, PayslipRow } from "@/lib/payroll/report";

const dayFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const shortDayFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

/**
 * Builds the payslip's page-2 detail: the clock-in/out sessions (hourly) and the
 * unpaid projects credited to the quota points on the slip. Shared by the
 * on-screen payslip and the emailed copy so they match.
 */
export async function buildPayslipDetail(params: {
  userId: string;
  from: string;
  to: string;
  quota?: QuotaPayrollRow;
  hourly?: HourlyPayrollRow;
  slip: PayslipRow;
}): Promise<{ hourlySessions?: PayslipSession[]; quotaItems?: PayslipItem[] }> {
  const { userId, from, to, quota, hourly, slip } = params;

  let hourlySessions: PayslipSession[] | undefined;
  if (hourly && slip.hourlySalary > 0) {
    const logs = await getApprovedTimeLogsForPeriod(from, to);
    hourlySessions = logs
      .filter((l) => l.userId === userId)
      .map((l) => ({
        dateLabel: dayFmt.format(new Date(`${l.workDate}T00:00:00+08:00`)),
        timeIn: l.clockIn ? timeFmt.format(new Date(l.clockIn)) : "—",
        timeOut: l.clockOut ? timeFmt.format(new Date(l.clockOut)) : "—",
        hours: l.hours,
      }));
  }

  let quotaItems: PayslipItem[] | undefined;
  if (quota && slip.quotaSalary > 0) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const breakdown = await getPointsBreakdown("1970-01-01", to);
    const { unpaidLines } = splitPaidUnpaid(breakdown.get(userId) ?? [], quota.pointsPaid);
    // Only list the projects this payout actually covers: unpaid lines
    // oldest-first, up to the payable points (one cycle when over quota). A
    // project that straddles the cap is listed with just the points that fit,
    // so the payslip's total is exactly the payable amount (e.g. 21, not 21.5)
    // and the rest carries to the next cycle.
    const items: PayslipItem[] = [];
    let covered = 0;
    for (const l of unpaidLines) {
      if (covered >= quota.pointsPayable) break;
      const take = Math.min(l.points, round2(quota.pointsPayable - covered));
      items.push({
        label: l.kind === "adjustment" ? "Adjustment" : DELIVERABLE_TYPE_LABELS[l.type ?? "DLP"] ?? l.title,
        detail: l.subtitle,
        points: take,
        dateLabel: shortDayFmt.format(new Date(l.dateIso)),
      });
      covered = round2(covered + take);
    }
    quotaItems = items;
  }

  return { hourlySessions, quotaItems };
}

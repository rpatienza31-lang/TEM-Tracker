import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments, timeLogs, users } from "@/db/schema";

export type DailySession = {
  id: string;
  workDate: string;
  clockInIso: string | null;
  clockOutIso: string | null;
  hours: number;
  note: string | null;
};

/**
 * Every clock-in/out record for each daily staffer in the period, grouped by
 * user — the attendance breakdown behind the day count. Includes in-progress
 * sessions (no clock-out yet) so the owner can fix a forgotten clock-out.
 */
export async function getDailyStaffSessions(from: string, to: string): Promise<Record<string, DailySession[]>> {
  const rows = await db
    .select({
      id: timeLogs.id,
      userId: timeLogs.userId,
      workDate: timeLogs.workDate,
      clockIn: timeLogs.clockIn,
      clockOut: timeLogs.clockOut,
      hours: timeLogs.hours,
      note: timeLogs.note,
    })
    .from(timeLogs)
    .innerJoin(users, eq(users.id, timeLogs.userId))
    .where(
      and(
        eq(users.role, "staff"),
        sql`${timeLogs.clockIn} is not null`,
        sql`${timeLogs.workDate} >= ${from}`,
        sql`${timeLogs.workDate} <= ${to}`,
      ),
    )
    .orderBy(asc(timeLogs.workDate), asc(timeLogs.clockIn));

  const byUser: Record<string, DailySession[]> = {};
  for (const r of rows) {
    (byUser[r.userId] ??= []).push({
      id: r.id,
      workDate: r.workDate,
      clockInIso: r.clockIn ? new Date(r.clockIn).toISOString() : null,
      clockOutIso: r.clockOut ? new Date(r.clockOut).toISOString() : null,
      hours: r.hours ? Number(r.hours) : 0,
      note: r.note,
    });
  }
  return byUser;
}

export type DailyStaffRow = {
  userId: string;
  fullName: string;
  dailyRate: number;
  // Distinct days present (clocked in) within the period.
  daysPresent: number;
  // Days already paid for this exact period.
  daysPaid: number;
  daysUnpaid: number;
  // daysUnpaid × dailyRate.
  salary: number;
  cashAdvance: number;
  isPaid: boolean;
};

/**
 * Fixed-daily staff for a pay period: each time-only staff member with the count
 * of distinct days they clocked in, their daily rate, and the resulting salary
 * for the days not yet paid in this exact period.
 */
export async function getDailyStaffForPeriod(from: string, to: string): Promise<DailyStaffRow[]> {
  const staff = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      dailyRate: users.dailyRate,
      cashAdvance: users.cashAdvance,
    })
    .from(users)
    .where(and(eq(users.role, "staff"), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
  if (staff.length === 0) return [];

  // Distinct attendance days per staffer in [from, to] (any clock-in that day).
  const attendance = await db
    .select({
      userId: timeLogs.userId,
      days: sql<number>`count(distinct ${timeLogs.workDate})::int`,
    })
    .from(timeLogs)
    .where(
      and(
        sql`${timeLogs.clockIn} is not null`,
        sql`${timeLogs.workDate} >= ${from}`,
        sql`${timeLogs.workDate} <= ${to}`,
      ),
    )
    .groupBy(timeLogs.userId);
  const presentByUser = new Map(attendance.map((a) => [a.userId, Number(a.days)]));

  // Days already paid for this exact period.
  const paid = await db
    .select({
      editorId: payrollPayments.editorId,
      days: sql<number>`coalesce(sum(${payrollPayments.points}), 0)`,
    })
    .from(payrollPayments)
    .where(
      and(
        eq(payrollPayments.kind, "daily"),
        eq(payrollPayments.periodFrom, from),
        eq(payrollPayments.periodTo, to),
      ),
    )
    .groupBy(payrollPayments.editorId);
  const paidByUser = new Map(paid.map((p) => [p.editorId, Number(p.days)]));

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return staff.map((s) => {
    const daysPresent = presentByUser.get(s.id) ?? 0;
    const daysPaid = paidByUser.get(s.id) ?? 0;
    const daysUnpaid = Math.max(0, daysPresent - daysPaid);
    const rate = Number(s.dailyRate);
    return {
      userId: s.id,
      fullName: s.fullName,
      dailyRate: rate,
      daysPresent,
      daysPaid,
      daysUnpaid,
      salary: round2(daysUnpaid * rate),
      cashAdvance: Number(s.cashAdvance),
      isPaid: daysPresent > 0 && daysUnpaid === 0,
    };
  });
}

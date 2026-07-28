import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { timeLogs, users } from "@/db/schema";

export async function getMyTimeLogs(userId: string) {
  return db
    .select()
    .from(timeLogs)
    .where(eq(timeLogs.userId, userId))
    .orderBy(desc(timeLogs.workDate), desc(timeLogs.createdAt));
}

/** The user's currently-open clock-in session (clocked in, not yet out), if any. */
export async function getActiveTimeLog(userId: string) {
  const [open] = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.userId, userId), isNotNull(timeLogs.clockIn), isNull(timeLogs.clockOut)))
    .orderBy(desc(timeLogs.clockIn))
    .limit(1);
  return open ?? null;
}

export async function getPendingTimeLogs() {
  return db
    .select({
      id: timeLogs.id,
      userId: timeLogs.userId,
      userName: users.fullName,
      workDate: timeLogs.workDate,
      hours: timeLogs.hours,
      note: timeLogs.note,
      createdAt: timeLogs.createdAt,
    })
    .from(timeLogs)
    .innerJoin(users, eq(users.id, timeLogs.userId))
    // Only completed logs await approval — an open clock-in has hours = null.
    .where(and(isNull(timeLogs.approvedAt), isNotNull(timeLogs.hours)))
    .orderBy(asc(timeLogs.workDate));
}

export type ApprovedHours = { userId: string; hours: number };

export async function getApprovedHoursForPeriod(from: string, to: string): Promise<ApprovedHours[]> {
  const rows = await db
    .select({ userId: timeLogs.userId, hours: sql<string>`sum(${timeLogs.hours})` })
    .from(timeLogs)
    .where(
      and(
        isNotNull(timeLogs.approvedAt),
        gte(timeLogs.workDate, from),
        lte(timeLogs.workDate, to),
      ),
    )
    .groupBy(timeLogs.userId);

  return rows.map((r) => ({ userId: r.userId, hours: Number(r.hours) }));
}

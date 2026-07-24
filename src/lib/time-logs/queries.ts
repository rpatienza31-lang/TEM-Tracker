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
    .where(isNull(timeLogs.approvedAt))
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

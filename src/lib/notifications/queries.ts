import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { notifications, workItems } from "@/db/schema";
import { overdueCondition, atRiskCondition } from "@/lib/work-items/queries";
import type { AppUser } from "@/lib/auth";

export async function getNotificationsForBell(userId: string, limit = 15) {
  const [items, [{ count: unreadCount }]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        message: notifications.message,
        workItemId: notifications.workItemId,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);

  return { items, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export type LiveAlert = { label: string; count: number; href: string; tone: "danger" | "warn" };

/** Computed on read, not stored — the "unclaimed item" / "due soon" alerts (spec §9 Phase 4). */
export async function getLiveAlertsForUser(user: Pick<AppUser, "id" | "role">): Promise<LiveAlert[]> {
  if (user.role === "owner" || user.role === "admin") {
    const [row] = await db
      .select({
        overdue: sql<number>`count(*) filter (where ${overdueCondition()})::int`,
        atRisk: sql<number>`count(*) filter (where ${atRiskCondition()})::int`,
      })
      .from(workItems);

    const alerts: LiveAlert[] = [];
    if (row.overdue > 0) alerts.push({ label: "overdue", count: row.overdue, href: "/board?overdueOnly=1", tone: "danger" });
    if (row.atRisk > 0) alerts.push({ label: "unclaimed at risk", count: row.atRisk, href: "/board?availableOnly=1", tone: "warn" });
    return alerts;
  }

  if (user.role === "editor") {
    // Scoped to items the editor is still personally holding (claimed or
    // sent back for revision) — an in_review/approved item is out of their
    // hands, so it shouldn't read as something *they're* behind on.
    const [row] = await db
      .select({
        overdue: sql<number>`count(*) filter (where ${workItems.assigneeId} = ${user.id} and ${workItems.status} in ('claimed','revision') and ${workItems.dueDate} < current_date)::int`,
        dueSoon: sql<number>`count(*) filter (where ${workItems.assigneeId} = ${user.id} and ${workItems.status} in ('claimed','revision') and ${workItems.dueDate} >= current_date and ${workItems.dueDate} <= current_date + interval '3 days')::int`,
      })
      .from(workItems);

    const alerts: LiveAlert[] = [];
    if (row.overdue > 0) alerts.push({ label: "of your items overdue", count: row.overdue, href: "/my-work", tone: "danger" });
    if (row.dueSoon > 0) alerts.push({ label: "of your items due soon", count: row.dueSoon, href: "/my-work", tone: "warn" });
    return alerts;
  }

  return [];
}

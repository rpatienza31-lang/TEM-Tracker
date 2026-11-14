import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { scheduleEvents, users } from "@/db/schema";

export type ScheduleAction = "scheduled" | "unscheduled" | "assigned" | "claimed" | "revision";
export type ScheduleItemKind = "catalog" | "cot";

/**
 * Records who did a Project Schedule action on a deliverable. Best-effort — a
 * logging failure never blocks the underlying action.
 */
export async function logScheduleEvent(params: {
  itemKind: ScheduleItemKind;
  itemId: string;
  actorId: string;
  action: ScheduleAction;
  detail?: string | null;
}): Promise<void> {
  try {
    await db.insert(scheduleEvents).values({
      itemKind: params.itemKind,
      itemId: params.itemId,
      actorId: params.actorId,
      action: params.action,
      detail: params.detail ?? null,
    });
  } catch {
    /* audit logging is non-critical — ignore */
  }
}

export type ScheduleActivityEntry = {
  action: ScheduleAction;
  actorName: string | null;
  detail: string | null;
  at: string; // ISO
};

/**
 * The recent schedule actions for the given deliverable ids, newest first,
 * keyed by item id — for the hover/click panel on a schedule card. Capped so a
 * long history stays readable.
 */
export async function getScheduleActivity(itemIds: string[]): Promise<Map<string, ScheduleActivityEntry[]>> {
  const map = new Map<string, ScheduleActivityEntry[]>();
  if (itemIds.length === 0) return map;

  const rows = await db
    .select({
      itemId: scheduleEvents.itemId,
      action: scheduleEvents.action,
      detail: scheduleEvents.detail,
      createdAt: scheduleEvents.createdAt,
      actorName: users.fullName,
    })
    .from(scheduleEvents)
    .leftJoin(users, eq(users.id, scheduleEvents.actorId))
    .where(inArray(scheduleEvents.itemId, itemIds))
    .orderBy(desc(scheduleEvents.createdAt))
    .limit(2000);

  for (const r of rows) {
    const list = map.get(r.itemId) ?? [];
    // Keep at most 6 most-recent entries per item.
    if (list.length < 6) {
      list.push({
        action: r.action as ScheduleAction,
        actorName: r.actorName ?? null,
        detail: r.detail,
        at: new Date(r.createdAt).toISOString(),
      });
      map.set(r.itemId, list);
    }
  }
  return map;
}

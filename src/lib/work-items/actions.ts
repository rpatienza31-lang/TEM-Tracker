"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { customOrderItems, customOrders, staffAvailability, workItems } from "@/db/schema";
import type { AvailabilityKind } from "@/lib/work-items/queries";
import { deleteWorkItem, transitionWorkItem, type DeleteResult, type TransitionResult } from "@/lib/work-items/transitions";

function refresh() {
  revalidatePath("/board");
  revalidatePath("/matrix");
  revalidatePath("/my-work");
  revalidatePath("/review");
  revalidatePath("/productivity");
  revalidatePath("/schedule");
  revalidatePath("/cot");
  revalidatePath("/");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Owner/admin sets (or clears, with an empty date) an item's deadline. This same
 * date is what places the item on the Project Schedule, so setting a deadline
 * here makes it show up on that day; clearing it takes it off the schedule.
 */
export async function setDueDateAction(
  itemId: string,
  date: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  const value = date && date.trim() ? date.trim() : null;
  if (value && !ISO_DATE.test(value)) return { ok: false, message: "Invalid date." };
  await db.update(workItems).set({ dueDate: value, updatedAt: new Date() }).where(eq(workItems.id, itemId));
  refresh();
  return { ok: true };
}

/**
 * Owner/admin sets (or clears) the free-text note shown on an item's Project
 * Schedule card — a reminder or instruction for the assigned editor.
 */
export async function setScheduleNoteAction(
  itemId: string,
  note: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  const value = note && note.trim() ? note.trim().slice(0, 500) : null;
  await db.update(workItems).set({ scheduleNote: value, updatedAt: new Date() }).where(eq(workItems.id, itemId));
  refresh();
  return { ok: true };
}

/**
 * Owner/admin sets (or clears) a COT order's deadline from the schedule. The
 * deadline lives on the order, so this moves both of its items (DLP + PPT).
 */
export async function setCotDeadlineAction(
  orderId: string,
  date: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  const value = date && date.trim() ? date.trim() : null;
  if (!value) return { ok: false, message: "A COT order must keep a deadline." };
  if (!ISO_DATE.test(value)) return { ok: false, message: "Invalid date." };
  await db.update(customOrders).set({ deadline: value }).where(eq(customOrders.id, orderId));
  refresh();
  return { ok: true };
}

/**
 * Owner/admin sets (or clears) a single COT deliverable's schedule day, so DLP
 * and PPT of one order can sit on different days. Clearing it (null) reverts the
 * item to the order's deadline.
 */
export async function setCotItemScheduleAction(
  itemId: string,
  date: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  const value = date && date.trim() ? date.trim() : null;
  if (value && !ISO_DATE.test(value)) return { ok: false, message: "Invalid date." };
  await db.update(customOrderItems).set({ scheduledFor: value, updatedAt: new Date() }).where(eq(customOrderItems.id, itemId));
  refresh();
  return { ok: true };
}

/** Owner/admin sets (or clears) the schedule note on a COT order. */
export async function setCotScheduleNoteAction(
  orderId: string,
  note: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  const value = note && note.trim() ? note.trim().slice(0, 500) : null;
  await db.update(customOrders).set({ scheduleNote: value }).where(eq(customOrders.id, orderId));
  refresh();
  return { ok: true };
}

const AVAILABILITY_KINDS = ["day_off", "vacation", "school", "absent"] as const;

/**
 * Owner/admin marks a staff member's non-working day (day off / vacation /
 * school / absent) on the schedule, or clears it when `kind` is null. One marker
 * per person per day, so setting again overwrites the previous one.
 */
export async function setAvailabilityAction(
  editorId: string,
  date: string,
  kind: AvailabilityKind | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  if (!ISO_DATE.test(date)) return { ok: false, message: "Invalid date." };

  if (kind === null) {
    await db
      .delete(staffAvailability)
      .where(and(eq(staffAvailability.editorId, editorId), eq(staffAvailability.date, date)));
    refresh();
    return { ok: true };
  }

  if (!AVAILABILITY_KINDS.includes(kind)) return { ok: false, message: "Invalid status." };
  await db
    .insert(staffAvailability)
    .values({ editorId, date, kind })
    .onConflictDoUpdate({
      target: [staffAvailability.editorId, staffAvailability.date],
      set: { kind },
    });
  refresh();
  return { ok: true };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Owner/admin marks a staff member's status across an inclusive date range in
 * one go (e.g. vacation Aug 12–16). Every day in the range is upserted, so it
 * overwrites any existing markers there. The span is capped to keep it sane.
 */
export async function setAvailabilityRangeAction(
  editorId: string,
  from: string,
  to: string,
  kind: AvailabilityKind,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner", "admin");
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return { ok: false, message: "Invalid date." };
  if (!AVAILABILITY_KINDS.includes(kind)) return { ok: false, message: "Invalid status." };
  if (to < from) return { ok: false, message: "The end date is before the start date." };

  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    dates.push(d);
    if (dates.length > 92) return { ok: false, message: "Please pick a range of 3 months or less." };
  }

  await db
    .insert(staffAvailability)
    .values(dates.map((date) => ({ editorId, date, kind })))
    .onConflictDoUpdate({
      target: [staffAvailability.editorId, staffAvailability.date],
      set: { kind },
    });
  refresh();
  return { ok: true, message: `Marked ${dates.length} day${dates.length === 1 ? "" : "s"}.` };
}

export async function claimItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "claim", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function assignItemAction(
  itemId: string,
  assigneeId: string,
  overrideWip = false,
  dueDate?: string | null,
): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "assign", itemId, actor, assigneeId, overrideWip });
  if (result.ok) {
    // Assigning is also when the deadline gets set, and that deadline is what
    // places the item on the Project Schedule.
    const value = dueDate && dueDate.trim() ? dueDate.trim() : null;
    if (value && ISO_DATE.test(value)) {
      await db.update(workItems).set({ dueDate: value, updatedAt: new Date() }).where(eq(workItems.id, itemId));
    }
    refresh();
  }
  return result;
}

export async function releaseItemAction(itemId: string, note?: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "release", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

export async function submitItemAction(
  itemId: string,
  data: { fileUrl: string; notes?: string },
): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "submit", itemId, actor, ...data });
  if (result.ok) refresh();
  return result;
}

export async function requestRevisionAction(itemId: string, note: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "request_revision", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

export async function approveItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "approve", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function unapproveItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "unapprove", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function uploadItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "upload", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function cancelItemAction(itemId: string, note?: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "cancel", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

export async function deleteItemAction(itemId: string): Promise<DeleteResult> {
  const actor = await requireUser();
  const result = await deleteWorkItem(itemId, actor);
  if (result.ok) refresh();
  return result;
}

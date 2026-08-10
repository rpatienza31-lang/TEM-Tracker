"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { workItems } from "@/db/schema";
import { deleteWorkItem, transitionWorkItem, type DeleteResult, type TransitionResult } from "@/lib/work-items/transitions";

function refresh() {
  revalidatePath("/board");
  revalidatePath("/matrix");
  revalidatePath("/my-work");
  revalidatePath("/review");
  revalidatePath("/productivity");
  revalidatePath("/schedule");
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

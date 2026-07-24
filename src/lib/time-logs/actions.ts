"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { timeLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const ADMIN_ROLES = ["owner", "admin"] as const;

function isAdmin(role: string) {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export type TimeLogActionResult = { ok: true } | { ok: false; message: string };

export async function createTimeLogAction(
  workDate: string,
  hours: number,
  note: string | undefined,
  targetUserId?: string,
): Promise<TimeLogActionResult> {
  const actor = await requireUser();

  if (targetUserId && targetUserId !== actor.id && !isAdmin(actor.role)) {
    return { ok: false, message: "Only admins can log hours on someone else's behalf." };
  }
  if (!workDate) return { ok: false, message: "A work date is required." };
  if (!(hours > 0 && hours <= 24)) return { ok: false, message: "Hours must be greater than 0 and at most 24." };

  await db.insert(timeLogs).values({
    userId: targetUserId ?? actor.id,
    workDate,
    hours: String(hours),
    note: note || null,
  });

  revalidatePath("/time-logs");
  revalidatePath("/payroll");
  return { ok: true };
}

export async function approveTimeLogAction(logId: string): Promise<TimeLogActionResult> {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) return { ok: false, message: "Only admins can approve time logs." };

  await db
    .update(timeLogs)
    .set({ approvedBy: actor.id, approvedAt: new Date() })
    .where(and(eq(timeLogs.id, logId), isNull(timeLogs.approvedAt)));

  revalidatePath("/payroll");
  return { ok: true };
}

export async function deleteTimeLogAction(logId: string): Promise<TimeLogActionResult> {
  const actor = await requireUser();

  const [log] = await db.select().from(timeLogs).where(eq(timeLogs.id, logId)).limit(1);
  if (!log) return { ok: false, message: "Time log not found." };
  if (log.approvedAt) return { ok: false, message: "Cannot delete an already-approved time log." };
  if (log.userId !== actor.id && !isAdmin(actor.role)) {
    return { ok: false, message: "You can only delete your own time logs." };
  }

  await db.delete(timeLogs).where(eq(timeLogs.id, logId));

  revalidatePath("/time-logs");
  revalidatePath("/payroll");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/db/client";
import { timeLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const ADMIN_ROLES = ["owner", "admin"] as const;
const PH_TZ = "Asia/Manila";

function isAdmin(role: string) {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** The user's currently-open clock-in session, if any (clocked in, not out). */
async function getOpenSession(userId: string) {
  const [open] = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.userId, userId), isNotNull(timeLogs.clockIn), isNull(timeLogs.clockOut)))
    .orderBy(desc(timeLogs.clockIn))
    .limit(1);
  return open ?? null;
}

export type TimeLogActionResult = { ok: true } | { ok: false; message: string };

/** Starts a shift. Records the server's current time (stored UTC, shown in PH time). */
export async function clockInAction(): Promise<TimeLogActionResult> {
  const actor = await requireUser();
  if (actor.role !== "staff" && actor.payType !== "hourly" && actor.payType !== "both") {
    return { ok: false, message: "Only hourly or time-only staff use the time clock." };
  }
  if (await getOpenSession(actor.id)) {
    return { ok: false, message: "You're already clocked in. Clock out first." };
  }

  const now = new Date();
  await db.insert(timeLogs).values({
    userId: actor.id,
    workDate: formatInTimeZone(now, PH_TZ, "yyyy-MM-dd"),
    clockIn: now,
    hours: null,
  });

  revalidatePath("/time-logs");
  return { ok: true };
}

/** Ends the open shift and computes hours from the elapsed clock-in→clock-out time. */
export async function clockOutAction(): Promise<TimeLogActionResult> {
  const actor = await requireUser();
  const open = await getOpenSession(actor.id);
  if (!open || !open.clockIn) {
    return { ok: false, message: "You're not clocked in." };
  }

  const now = new Date();
  const elapsedHours = (now.getTime() - new Date(open.clockIn).getTime()) / 3_600_000;
  // Clamp into the column's valid range: a tiny minimum for near-instant
  // clock-outs, and 24h max for a shift someone forgot to close (admin reviews).
  const hours = Math.min(24, Math.max(0.01, Math.round(elapsedHours * 100) / 100));

  await db.update(timeLogs).set({ clockOut: now, hours: String(hours) }).where(eq(timeLogs.id, open.id));

  revalidatePath("/time-logs");
  revalidatePath("/payroll");
  return { ok: true };
}

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

/**
 * Approves a completed time-log session. `countsHourly` decides whether the
 * hours feed hourly pay ("Hourly (paid)") or are approved for monitoring only
 * ("Attendance only" — a quota staffer's presence, paid ₱0 hourly). Both mark
 * the session approved so it leaves the pending list.
 */
export async function approveTimeLogAction(
  logId: string,
  countsHourly: boolean,
): Promise<TimeLogActionResult> {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) return { ok: false, message: "Only admins can approve time logs." };

  await db
    .update(timeLogs)
    .set({ approvedBy: actor.id, approvedAt: new Date(), countsHourly })
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

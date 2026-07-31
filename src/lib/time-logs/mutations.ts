import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { timeLogs } from "@/db/schema";

const PH_OFFSET = "+08:00"; // The Philippines has no daylight saving, so a fixed offset is exact.
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Builds a timestamp from a work date (YYYY-MM-DD) and a PH-local HH:MM time. */
function phTimestamp(workDate: string, hhmm: string): Date | null {
  if (!HHMM.test(hhmm)) return null;
  const d = new Date(`${workDate}T${hhmm}:00${PH_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type EditTimeLogResult = { ok: boolean; message?: string; hours?: number };

/**
 * Owner correction for a time log's clock-in / clock-out (spec: staff sometimes
 * forget to clock in or out). Recomputes hours from the corrected times so the
 * approved-hours total and salary stay consistent. Uses the log's own work date
 * as the day; a time-out at or before the time-in is treated as the next day so
 * overnight sessions work. The row's approval status is left untouched.
 */
export async function updateTimeLogTimes(params: {
  logId: string;
  timeIn: string;
  timeOut: string;
}): Promise<EditTimeLogResult> {
  const { logId, timeIn, timeOut } = params;

  const [log] = await db.select().from(timeLogs).where(eq(timeLogs.id, logId)).limit(1);
  if (!log) return { ok: false, message: "Time log not found." };

  const inAt = phTimestamp(log.workDate, timeIn);
  let outAt = phTimestamp(log.workDate, timeOut);
  if (!inAt || !outAt) return { ok: false, message: "Enter both time in and time out as HH:MM." };

  // Clock-out on/before clock-in means the shift ran past midnight.
  if (outAt.getTime() <= inAt.getTime()) outAt = new Date(outAt.getTime() + 24 * 60 * 60 * 1000);

  const hours = Math.round(((outAt.getTime() - inAt.getTime()) / 3_600_000) * 100) / 100;
  if (hours <= 0 || hours > 24) {
    return { ok: false, message: "Corrected hours must be between 0 and 24." };
  }

  await db.update(timeLogs).set({ clockIn: inAt, clockOut: outAt, hours: hours.toFixed(2) }).where(eq(timeLogs.id, logId));
  return { ok: true, hours };
}

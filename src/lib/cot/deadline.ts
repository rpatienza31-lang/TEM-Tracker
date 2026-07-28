import { formatInTimeZone } from "date-fns-tz";

const PH_TZ = "Asia/Manila";

export const RUSH_DAYS = 5;
export const REGULAR_DAYS = 7;

export type OrderType = "rush" | "regular";
export type PriorityLevel = "overdue" | "red" | "alert" | "normal";

/** Deadline = order date + 5 (rush) or 7 (regular) calendar days, as YYYY-MM-DD. */
export function computeDeadline(orderDate: string, type: OrderType): string {
  const days = type === "rush" ? RUSH_DAYS : REGULAR_DAYS;
  const d = new Date(`${orderDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in Philippine time as YYYY-MM-DD. */
export function phToday(now: Date = new Date()): string {
  return formatInTimeZone(now, PH_TZ, "yyyy-MM-dd");
}

/** Whole days from today (PH) until the deadline; negative if past due. */
export function daysUntil(deadline: string, today: string = phToday()): number {
  const a = new Date(`${deadline}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

/**
 * Priority for a deadline: overdue (past), red (due today or tomorrow),
 * alert (within 3 days), otherwise normal — mirrors the customer sheet's
 * red-alert colouring so the team can triage rush work.
 */
export function priorityFor(deadline: string, today: string = phToday()): { level: PriorityLevel; daysLeft: number } {
  const daysLeft = daysUntil(deadline, today);
  let level: PriorityLevel = "normal";
  if (daysLeft < 0) level = "overdue";
  else if (daysLeft <= 1) level = "red";
  else if (daysLeft <= 3) level = "alert";
  return { level, daysLeft };
}

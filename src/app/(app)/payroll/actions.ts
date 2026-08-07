"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getPayrollReport } from "@/lib/payroll/report";
import { renderPayslipHtml } from "@/lib/payroll/payslip-html";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import { editLinePoints, type LineKind } from "@/lib/payroll/edit-line";
import { updateTimeLogTimes } from "@/lib/time-logs/mutations";
import { sendMail } from "@/lib/email/mailer";

export type SetRateState = { status: "idle" | "ok" | "error"; message?: string };

/** Emails an employee their payslip for the given period (owner only). */
export async function emailPayslipAction(
  userId: string,
  from: string,
  to: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole("owner");

  const [staff] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!staff?.email) return { ok: false, message: "This staff member has no email on file." };

  const report = await getPayrollReport(from, to);
  const slip = report.payslips.find((p) => p.userId === userId);
  if (!slip) return { ok: false, message: "No payslip for this staff member in this period." };
  const quota = report.quotaRows.find((r) => r.userId === userId);
  const hourly = report.hourlyRows.find((r) => r.userId === userId);

  const html = renderPayslipHtml({
    fullName: slip.fullName,
    from,
    to,
    quota: quota ? { cycles: quota.cyclesCompleted, rate: quota.rate, amount: slip.quotaSalary } : undefined,
    hourly: hourly ? { hours: hourly.approvedHours, rate: hourly.rate, amount: slip.hourlySalary } : undefined,
    gross: slip.gross,
    cashAdvance: slip.cashAdvance,
    net: slip.net,
  });

  return sendMail({ to: staff.email, subject: `Your payslip — ${from} to ${to}`, html });
}

/**
 * Sets a staff member's pay rate. `field` selects which rate: "hourly" (pesos
 * per approved hour) or "cycle" (pesos per completed cycle). Owner-only —
 * rates and salary are never exposed to admins or other roles.
 */
export async function setUserRateAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");

  const userId = String(formData.get("userId") ?? "");
  const field = String(formData.get("field") ?? "cycle") === "hourly" ? "hourly" : "cycle";
  const raw = String(formData.get("rate") ?? "").trim();
  const rate = Number(raw);

  if (!userId) {
    return { status: "error", message: "Missing staff id." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { status: "error", message: "Enter a valid amount (0 or more)." };
  }

  const value = rate.toFixed(2);
  await db
    .update(users)
    .set(field === "hourly" ? { hourlyRate: value } : { cycleRate: value })
    .where(eq(users.id, userId));
  revalidatePath("/payroll");
  return { status: "ok", message: "Saved." };
}

/** Sets a staff member's cash advance (deducted from their payout). Owner-only. */
export async function setUserCashAdvanceAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");

  const userId = String(formData.get("userId") ?? "");
  const amount = Number(String(formData.get("rate") ?? "").trim());

  if (!userId) return { status: "error", message: "Missing staff id." };
  if (!Number.isFinite(amount) || amount < 0) {
    return { status: "error", message: "Enter a valid amount (0 or more)." };
  }

  await db.update(users).set({ cashAdvance: amount.toFixed(2) }).where(eq(users.id, userId));
  revalidatePath("/payroll");
  return { status: "ok", message: "Saved." };
}

/**
 * Applies a manual point correction to an editor's open quota cycle and logs
 * it for audit. `points` may be negative (dock) or positive (bonus) but not
 * zero. Owner-only — points feed salary, so only the owner may hand-edit them.
 */
export async function adjustPointsAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  const actor = await requireRole("owner");

  const editorId = String(formData.get("editorId") ?? "");
  const points = Number(String(formData.get("points") ?? "").trim());
  const note = String(formData.get("note") ?? "");

  if (!editorId) return { status: "error", message: "Missing editor." };
  if (!Number.isFinite(points) || points === 0) {
    return { status: "error", message: "Enter a non-zero amount (use a minus sign to deduct)." };
  }

  await recordPointAdjustment({ editorId, points, note, actorId: actor.id });
  revalidatePath("/payroll");
  return { status: "ok", message: "Adjusted." };
}

const LINE_KINDS: LineKind[] = ["catalog", "cot", "adjustment"];

/**
 * Edits one breakdown line's point value in place (owner only), keeping the
 * cycle it landed in consistent. Used to correct a project whose recorded
 * points differ from what it should be worth (e.g. an EPP item at 1.0 → 0.6).
 */
export async function editLinePointsAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");

  const kind = String(formData.get("kind") ?? "");
  const refId = String(formData.get("refId") ?? "");
  const newPoints = Number(String(formData.get("newPoints") ?? "").trim());

  if (!LINE_KINDS.includes(kind as LineKind)) return { status: "error", message: "Unknown line type." };
  if (!refId) return { status: "error", message: "Missing line." };

  const res = await editLinePoints({ kind: kind as LineKind, refId, newPoints });
  if (!res.ok) return { status: "error", message: res.message };
  revalidatePath("/payroll");
  return { status: "ok", message: "Saved." };
}

/**
 * Corrects an approved time log's clock-in / clock-out (owner only), for when a
 * staffer forgot to clock in or out. Hours are recomputed from the new times so
 * approved-hours totals and salary stay in sync.
 */
export async function editTimeLogTimesAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");

  const logId = String(formData.get("logId") ?? "");
  const timeIn = String(formData.get("timeIn") ?? "").trim();
  const timeOut = String(formData.get("timeOut") ?? "").trim();

  if (!logId) return { status: "error", message: "Missing time log." };

  const res = await updateTimeLogTimes({ logId, timeIn, timeOut });
  if (!res.ok) return { status: "error", message: res.message };
  revalidatePath("/payroll");
  return { status: "ok", message: "Saved." };
}

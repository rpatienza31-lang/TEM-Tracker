"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getPayrollReport } from "@/lib/payroll/report";
import { renderPayslipHtml } from "@/lib/payroll/payslip-html";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import { getProductivityStats } from "@/lib/quota/productivity";
import { getQuotaSize } from "@/lib/settings";
import { editLinePoints, removeLine, type LineKind } from "@/lib/payroll/edit-line";
import { recordPayrollPayment, type PaymentItem } from "@/lib/payroll/payments";
import { getDailyStaffForPeriod } from "@/lib/payroll/daily";
import { getPointsBreakdown } from "@/lib/payroll/breakdown";
import { splitPaidUnpaid } from "@/lib/payroll/paid-split";
import { buildPayslipDetail } from "@/lib/payroll/payslip-detail";
import { updateTimeLogTimes } from "@/lib/time-logs/mutations";
import { sendMail } from "@/lib/email/mailer";

export type SetRateState = { status: "idle" | "ok" | "error"; message?: string };

/** Emails an employee their payslip for the given period (owner only). */
export async function emailPayslipAction(
  userId: string,
  from: string,
  to: string,
  include: "both" | "quota" | "hourly" = "both",
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

  // Match the emailed payslip to what's actually being paid — quota only,
  // hourly only, or both — so the email never shows a component that wasn't
  // part of this payout.
  const includeQuota = include !== "hourly";
  const includeHourly = include !== "quota";
  const quota = includeQuota ? report.quotaRows.find((r) => r.userId === userId) : undefined;
  const hourly = includeHourly ? report.hourlyRows.find((r) => r.userId === userId) : undefined;
  const { hourlySessions, quotaItems } = await buildPayslipDetail({ userId, from, to, quota, hourly, slip });

  const quotaAmount = includeQuota ? slip.quotaSalary : 0;
  const hourlyAmount = includeHourly ? slip.hourlySalary : 0;
  const gross = quotaAmount + hourlyAmount;
  const net = gross - slip.cashAdvance;

  const html = renderPayslipHtml({
    fullName: slip.fullName,
    from,
    to,
    quota: quota ? { points: quota.pointsPayable, perSubjectRate: quota.perSubjectRate, amount: quotaAmount } : undefined,
    hourly: hourly ? { hours: hourly.hoursUnpaid, rate: hourly.rate, amount: hourlyAmount } : undefined,
    gross,
    cashAdvance: slip.cashAdvance,
    net,
    hourlySessions,
    quotaItems,
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
  const rawField = String(formData.get("field") ?? "cycle");
  const field = rawField === "hourly" ? "hourly" : rawField === "daily" ? "daily" : "cycle";
  const raw = String(formData.get("rate") ?? "").trim();
  const rate = Number(raw);

  if (!userId) {
    return { status: "error", message: "Missing staff id." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { status: "error", message: "Enter a valid amount (0 or more)." };
  }

  const value = rate.toFixed(2);
  const set = field === "hourly" ? { hourlyRate: value } : field === "daily" ? { dailyRate: value } : { cycleRate: value };
  await db.update(users).set(set).where(eq(users.id, userId));
  revalidatePath("/payroll");
  return { status: "ok", message: "Saved." };
}

/** Records a fixed-daily staff payout for the period (days present × daily rate). */
export async function markDailyPaidAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  const actor = await requireRole("owner");
  const userId = String(formData.get("userId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!userId) return { status: "error", message: "Missing staff id." };
  if (!from || !to) return { status: "error", message: "Missing period." };

  const rows = await getDailyStaffForPeriod(from, to);
  const row = rows.find((r) => r.userId === userId);
  if (!row) return { status: "error", message: "No daily staff found." };
  if (row.daysUnpaid <= 0) return { status: "error", message: "Nothing unpaid for this period." };

  const outstandingCA = row.cashAdvance;
  const appliedCA = Math.min(Math.max(0, outstandingCA), row.salary);

  await recordPayrollPayment({
    editorId: userId,
    kind: "daily",
    points: row.daysUnpaid,
    cycles: 0,
    amount: row.salary,
    rate: row.dailyRate,
    cashAdvance: appliedCA,
    from,
    to,
    paidBy: actor.id,
  });
  if (appliedCA > 0) {
    await db
      .update(users)
      .set({ cashAdvance: (outstandingCA - appliedCA).toFixed(2) })
      .where(eq(users.id, userId));
  }
  revalidatePath("/payroll");
  return { status: "ok", message: `Recorded ${row.daysUnpaid} day(s).` };
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

/**
 * Records this period's quota payout for an editor and marks it paid. Owner
 * only. Recomputes the amount server-side and refuses to pay a period twice.
 */
export async function markQuotaPaidAction(
  _prev: SetRateState,
  formData: FormData,
): Promise<SetRateState> {
  const actor = await requireRole("owner");

  const userId = String(formData.get("userId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!userId) return { status: "error", message: "Missing staff id." };
  if (!from || !to) return { status: "error", message: "Missing period." };

  const report = await getPayrollReport(from, to);
  const row = report.quotaRows.find((r) => r.userId === userId);
  if (!row) return { status: "error", message: "No quota staff found." };
  if (row.pointsUnpaid <= 0) return { status: "error", message: "No unpaid balance to record." };

  // Optionally pay only part of the balance (e.g. one 21-point cycle); the rest
  // stays unpaid and carries into the next cycle. Defaults to the full balance.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const requested = Number(String(formData.get("points") ?? "").trim());
  const pointsToPay =
    Number.isFinite(requested) && requested > 0 ? Math.min(round2(requested), row.pointsUnpaid) : row.pointsUnpaid;
  const amountToPay = round2(pointsToPay * row.perSubjectRate);

  // Snapshot the projects this payout covers: unpaid lines oldest-first, only up
  // to the points being paid now (a partial payout covers just those).
  const breakdown = await getPointsBreakdown("1970-01-01", to);
  const { unpaidLines } = splitPaidUnpaid(breakdown.get(userId) ?? [], row.pointsPaid);
  const items: PaymentItem[] = [];
  let covered = 0;
  for (const l of unpaidLines) {
    if (covered >= pointsToPay) break;
    // A line that straddles the cap is snapshotted with just the points that
    // fit, so the recorded items sum to exactly pointsToPay (not overshoot).
    const take = Math.min(l.points, round2(pointsToPay - covered));
    items.push({ title: l.title, subtitle: l.subtitle, points: take, dateIso: l.dateIso, kind: l.kind });
    covered = round2(covered + take);
  }

  const quotaSize = row.perSubjectRate > 0 ? Math.round(row.rate / row.perSubjectRate) : 0;
  const cyclesPaid = quotaSize > 0 ? Math.round(pointsToPay / quotaSize) : row.completedCycles;

  // Recover the staff member's cash advance from this payout, up to the amount
  // being paid, and reduce their outstanding CA so it isn't deducted again.
  const [u] = await db.select({ cashAdvance: users.cashAdvance }).from(users).where(eq(users.id, userId)).limit(1);
  const outstandingCA = Number(u?.cashAdvance ?? 0);
  const appliedCA = Math.min(Math.max(0, outstandingCA), amountToPay);

  await recordPayrollPayment({
    editorId: userId,
    points: pointsToPay,
    cycles: cyclesPaid,
    amount: amountToPay,
    rate: row.rate,
    cashAdvance: appliedCA,
    items,
    from,
    to,
    paidBy: actor.id,
  });
  if (appliedCA > 0) {
    await db
      .update(users)
      .set({ cashAdvance: (outstandingCA - appliedCA).toFixed(2) })
      .where(eq(users.id, userId));
  }
  revalidatePath("/payroll");
  const carried = round2(row.pointsUnpaid - pointsToPay);
  const net = amountToPay - appliedCA;
  const carryMsg = carried > 0 ? ` ${carried} pt${carried === 1 ? "" : "s"} carried to the next cycle.` : "";
  return {
    status: "ok",
    message:
      (appliedCA > 0 ? `Paid — net ₱${net.toFixed(2)} after ₱${appliedCA.toFixed(2)} CA.` : "Marked as paid.") + carryMsg,
  };
}

/**
 * Records this period's hourly payout for a staff member and marks it paid,
 * mirroring the quota flow: pays the unpaid hours, recovers cash advance, and
 * refuses to pay a settled balance again. Owner only.
 */
export async function markHourlyPaidAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  const actor = await requireRole("owner");

  const userId = String(formData.get("userId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!userId) return { status: "error", message: "Missing staff id." };
  if (!from || !to) return { status: "error", message: "Missing period." };

  const report = await getPayrollReport(from, to);
  const row = report.hourlyRows.find((r) => r.userId === userId);
  if (!row) return { status: "error", message: "No hourly staff found." };
  if (row.hoursUnpaid <= 0) return { status: "error", message: "No unpaid hours to record." };

  const [u] = await db.select({ cashAdvance: users.cashAdvance }).from(users).where(eq(users.id, userId)).limit(1);
  const outstandingCA = Number(u?.cashAdvance ?? 0);
  const appliedCA = Math.min(Math.max(0, outstandingCA), row.salary);

  await recordPayrollPayment({
    editorId: userId,
    kind: "hourly",
    points: row.hoursUnpaid,
    cycles: 0,
    amount: row.salary,
    rate: row.rate,
    cashAdvance: appliedCA,
    from,
    to,
    paidBy: actor.id,
  });
  if (appliedCA > 0) {
    await db
      .update(users)
      .set({ cashAdvance: (outstandingCA - appliedCA).toFixed(2) })
      .where(eq(users.id, userId));
  }
  revalidatePath("/payroll");
  const net = row.salary - appliedCA;
  return {
    status: "ok",
    message: appliedCA > 0 ? `Paid — net ₱${net.toFixed(2)} after ₱${appliedCA.toFixed(2)} CA.` : "Marked as paid.",
  };
}

const LINE_KINDS_FOR_REMOVE: LineKind[] = ["catalog", "cot", "adjustment"];

/**
 * Truly removes a breakdown line (owner only): reverses its points and drops the
 * source, so the line disappears from the breakdown instead of being offset.
 */
export async function removeLineAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");
  const kind = String(formData.get("kind") ?? "");
  const refId = String(formData.get("refId") ?? "");
  if (!LINE_KINDS_FOR_REMOVE.includes(kind as LineKind)) return { status: "error", message: "Unknown line type." };
  if (!refId) return { status: "error", message: "Missing line." };

  const res = await removeLine({ kind: kind as LineKind, refId });
  if (!res.ok) return { status: "error", message: res.message };
  revalidatePath("/payroll");
  revalidatePath("/");
  return { status: "ok", message: "Removed." };
}

/**
 * Owner bulk-removes several breakdown lines at once (e.g. COT already paid
 * outside the app). Each is truly removed — points reversed and source row
 * dropped. Reports how many were removed.
 */
export async function removeLinesAction(
  lines: { kind: LineKind; refId: string }[],
): Promise<{ ok: boolean; removed: number; message?: string }> {
  await requireRole("owner");
  let removed = 0;
  for (const line of lines) {
    if (!LINE_KINDS_FOR_REMOVE.includes(line.kind) || !line.refId) continue;
    const res = await removeLine({ kind: line.kind, refId: line.refId });
    if (res.ok) removed++;
  }
  revalidatePath("/payroll");
  revalidatePath("/");
  return { ok: true, removed };
}

/**
 * Owner reconciliation: set an editor to the cycle number and current points
 * they are really on, without touching past approvals. The cycle number is a
 * display baseline (cycle_offset); the current points are set with a one-off
 * adjustment so the dashboard and payroll match. Both fields are optional.
 */
export async function reconcileEditorAction(_prev: SetRateState, formData: FormData): Promise<SetRateState> {
  await requireRole("owner");

  const editorId = String(formData.get("editorId") ?? "");
  const cycleRaw = String(formData.get("cycleNumber") ?? "").trim();
  const pointsRaw = String(formData.get("points") ?? "").trim();
  if (!editorId) return { status: "error", message: "Missing editor." };
  if (!cycleRaw && !pointsRaw) return { status: "error", message: "Enter a cycle number or current points." };

  const quotaSize = await getQuotaSize();
  const stats = await getProductivityStats();
  const row = stats.find((r) => r.editorId === editorId);
  if (!row) return { status: "error", message: "Editor not found." };

  if (cycleRaw) {
    const cycleNumber = Number(cycleRaw);
    if (!Number.isInteger(cycleNumber) || cycleNumber < 1) {
      return { status: "error", message: "Cycle number must be a whole number (1 or more)." };
    }
    const derivedRaw = quotaSize > 0 ? Math.floor(row.pointsPaid / quotaSize) + 1 : 1;
    await db.update(users).set({ cycleOffset: cycleNumber - derivedRaw }).where(eq(users.id, editorId));
  }

  if (pointsRaw) {
    const points = Number(pointsRaw);
    if (!Number.isFinite(points) || points < 0) {
      return { status: "error", message: "Current points must be 0 or more." };
    }
    const delta = Math.round((points - row.pointsUnpaid) * 100) / 100;
    if (delta !== 0) {
      await recordPointAdjustment({ editorId, points: delta, note: "Reconciliation baseline" });
    }
  }

  revalidatePath("/payroll");
  revalidatePath("/");
  return { status: "ok", message: "Reconciled." };
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

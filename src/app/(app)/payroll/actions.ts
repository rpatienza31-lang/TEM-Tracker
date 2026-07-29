"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getPayrollReport } from "@/lib/payroll/report";
import { renderPayslipHtml } from "@/lib/payroll/payslip-html";
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

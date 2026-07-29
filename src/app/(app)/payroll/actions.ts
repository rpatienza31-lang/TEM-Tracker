"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type SetRateState = { status: "idle" | "ok" | "error"; message?: string };

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

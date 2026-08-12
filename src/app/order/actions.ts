"use server";

import { revalidatePath } from "next/cache";

import { createCotOrder } from "@/lib/cot/service";
import { phToday } from "@/lib/cot/deadline";

export type PublicOrderState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Public COT order intake — clients fill this in themselves (no login). Creates
 * the order with its DLP + PPT deliverables. Protected by a hidden honeypot
 * field and, when configured, an access code (COT_PUBLIC_CODE).
 */
export async function submitPublicCotOrder(_prev: PublicOrderState, formData: FormData): Promise<PublicOrderState> {
  // Honeypot: bots fill hidden fields; humans never see this one.
  if (String(formData.get("company") ?? "").trim()) return { status: "ok", message: "Thank you!" };

  const requiredCode = process.env.COT_PUBLIC_CODE;
  if (requiredCode && String(formData.get("accessCode") ?? "").trim() !== requiredCode) {
    return { status: "error", message: "Incorrect access code." };
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!customerName) return { status: "error", message: "Please enter your name." };

  const gradeRaw = String(formData.get("grade") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const combinedNotes = [contact ? `Contact: ${contact}` : "", notes].filter(Boolean).join(" | ") || null;

  const result = await createCotOrder({
    customerName,
    grade: gradeRaw ? Number(gradeRaw.replace(/[^\d]/g, "")) || null : null,
    subjectName: String(formData.get("subjectName") ?? "").trim() || null,
    topic: String(formData.get("topic") ?? "").trim() || null,
    competency: String(formData.get("competency") ?? "").trim() || null,
    indicator: String(formData.get("indicator") ?? "").trim() || null,
    lessonFor: String(formData.get("lessonFor") ?? "").trim() || null,
    notes: combinedNotes,
    orderType: String(formData.get("orderType") ?? "regular") === "rush" ? "rush" : "regular",
    // The order date is when the client submits.
    orderDate: phToday(),
  });

  if (!result.ok) return { status: "error", message: result.message ?? "Could not submit your order. Please try again." };

  revalidatePath("/cot");
  revalidatePath("/schedule");
  return { status: "ok", message: "Your order has been submitted. Salamat!" };
}

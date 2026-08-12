"use server";

import { revalidatePath } from "next/cache";

import { createCotOrder } from "@/lib/cot/service";
import { phToday } from "@/lib/cot/deadline";

export type PublicOrderState = { status: "idle" | "ok" | "error"; message?: string };

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Public COT order intake — clients fill this in themselves (no login). Mirrors
 * the fields of the team's Google order form. Creates the order with its DLP +
 * PPT deliverables. Protected by a hidden honeypot field and, when configured,
 * an access code (COT_PUBLIC_CODE).
 *
 * Fields without a dedicated column (Term, Week, Type of learners, email) are
 * folded into the order's Notes in a clean, labelled format so staff see them.
 */
export async function submitPublicCotOrder(_prev: PublicOrderState, formData: FormData): Promise<PublicOrderState> {
  // Honeypot: bots fill hidden fields; humans never see this one.
  if (s(formData, "company")) return { status: "ok", message: "Thank you!" };

  const requiredCode = process.env.COT_PUBLIC_CODE;
  if (requiredCode && s(formData, "accessCode") !== requiredCode) {
    return { status: "error", message: "Incorrect access code." };
  }

  const facebookName = s(formData, "customerName");
  if (!facebookName) return { status: "error", message: "Please enter your Facebook name." };

  const email = s(formData, "email");
  if (!email) return { status: "error", message: "Please enter your DepEd or Gmail email." };

  if (formData.get("refundAgree") !== "on") {
    return { status: "error", message: "Please agree to the Refund Policy to continue." };
  }

  // Multi-select "Type of learners" + free-text "Others".
  const learners = formData.getAll("learners").map((v) => String(v).trim()).filter(Boolean);
  const othersLearner = s(formData, "learnersOther");
  if (othersLearner) learners.push(othersLearner);

  const gradeRaw = s(formData, "grade");
  const clientNote = s(formData, "notes");

  // Fold the fields that have no dedicated column into Notes, clearly labelled.
  const notes =
    [
      `Email: ${email}`,
      s(formData, "term") && `Term: ${s(formData, "term")}`,
      s(formData, "week") && `Week: ${s(formData, "week")}`,
      learners.length && `Type of learners: ${learners.join(", ")}`,
      clientNote && `Note: ${clientNote}`,
    ]
      .filter(Boolean)
      .join("\n") || null;

  const result = await createCotOrder({
    customerName: facebookName,
    grade: gradeRaw ? Number(gradeRaw) || null : null,
    subjectName: s(formData, "subjectName") || null,
    topic: s(formData, "topic") || null,
    competency: s(formData, "competency") || null,
    indicator: s(formData, "indicator") || null,
    lessonFor: s(formData, "lessonFor") || null,
    notes,
    orderType: s(formData, "orderType") === "rush" ? "rush" : "regular",
    // The order date is when the client submits.
    orderDate: phToday(),
  });

  if (!result.ok) return { status: "error", message: result.message ?? "Could not submit your order. Please try again." };

  revalidatePath("/cot");
  revalidatePath("/schedule");
  return { status: "ok", message: "Your order has been submitted. Salamat!" };
}

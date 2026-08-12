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

  const err = (message: string): PublicOrderState => ({ status: "error", message });

  // Every field is required except the Note.
  const facebookName = s(formData, "customerName");
  if (!facebookName) return err("Please enter your Facebook name.");

  const term = s(formData, "term");
  if (!term) return err("Please select a Term.");

  const gradeRaw = s(formData, "grade");
  if (!gradeRaw) return err("Please select a Grade.");

  const subject = s(formData, "subjectName");
  if (!subject) return err("Please enter a Subject.");

  const week = s(formData, "week");
  if (!week) return err("Please select a Week.");

  const topic = s(formData, "topic");
  if (!topic) return err("Please enter the Topic.");

  const competency = s(formData, "competency");
  if (!competency) return err("Please enter the Learning Competency.");

  const lessonFor = s(formData, "lessonFor");
  if (!lessonFor) return err("Please select Lesson For.");

  // Multi-select "Type of learners" + free-text "Others".
  const learners = formData.getAll("learners").map((v) => String(v).trim()).filter(Boolean);
  const othersLearner = s(formData, "learnersOther");
  if (othersLearner) learners.push(othersLearner);
  if (learners.length === 0) return err("Please select at least one Type of learners.");

  const indicator = s(formData, "indicator");
  if (!indicator) return err("Please select an Indicator.");

  const email = s(formData, "email");
  if (!email) return err("Please enter your DepEd or Gmail email.");

  if (formData.get("refundAgree") !== "on") {
    return err("Please agree to the Refund Policy to continue.");
  }

  const clientNote = s(formData, "notes");

  // Fold the fields that have no dedicated column into Notes, clearly labelled.
  const notes =
    [
      `Email: ${email}`,
      `Term: ${term}`,
      `Week: ${week}`,
      `Type of learners: ${learners.join(", ")}`,
      clientNote && `Note: ${clientNote}`,
    ]
      .filter(Boolean)
      .join("\n") || null;

  const result = await createCotOrder({
    customerName: facebookName,
    grade: Number(gradeRaw) || null,
    subjectName: subject,
    topic,
    competency,
    indicator,
    lessonFor,
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

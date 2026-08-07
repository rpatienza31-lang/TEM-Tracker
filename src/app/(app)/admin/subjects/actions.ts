"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { subjects } from "@/db/schema";
import { setSubjectPoints } from "@/lib/catalog/subject-points";

export type SubjectPointsState = { status: "idle" | "ok" | "error"; message?: string };

export async function createSubjectAction(formData: FormData) {
  await requireRole("owner", "admin");
  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim().toUpperCase();
  if (!name || !shortCode) return;

  await db.insert(subjects).values({ name, shortCode }).onConflictDoNothing();
  revalidatePath("/admin/subjects");
}

export async function setSubjectActiveAction(subjectId: string, isActive: boolean) {
  await requireRole("owner", "admin");
  await db.update(subjects).set({ isActive }).where(eq(subjects.id, subjectId));
  revalidatePath("/admin/subjects");
}

/**
 * Sets a subject's DLP and PPT point values (owner only). These override the
 * global points table for this subject and re-snapshot onto its not-yet-approved
 * items. Points feed salary, so only the owner may change them.
 */
export async function setSubjectPointsAction(
  _prev: SubjectPointsState,
  formData: FormData,
): Promise<SubjectPointsState> {
  await requireRole("owner");

  const subjectId = String(formData.get("subjectId") ?? "");
  const dlp = Number(String(formData.get("DLP") ?? "").trim());
  const ppt = Number(String(formData.get("PPT") ?? "").trim());

  if (!subjectId) return { status: "error", message: "Missing subject." };
  if (![dlp, ppt].every((v) => Number.isFinite(v) && v >= 0)) {
    return { status: "error", message: "Enter valid point values (0 or more)." };
  }

  await setSubjectPoints(subjectId, "DLP", dlp);
  await setSubjectPoints(subjectId, "PPT", ppt);
  revalidatePath("/admin/subjects");
  return { status: "ok", message: "Saved." };
}

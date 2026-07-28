"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { removeSubjectFromGrade, type RemoveSubjectResult } from "@/lib/catalog/offerings";

export async function removeSubjectFromGradeAction(
  termId: string,
  grade: number,
  subjectId: string,
): Promise<RemoveSubjectResult> {
  await requireRole("owner", "admin");
  const result = await removeSubjectFromGrade(termId, grade, subjectId);
  if (result.ok) revalidatePath("/matrix");
  return result;
}

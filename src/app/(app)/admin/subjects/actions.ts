"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { subjects } from "@/db/schema";

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

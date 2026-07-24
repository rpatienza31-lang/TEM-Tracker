"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, termWeeks, workItems } from "@/db/schema";

export async function createTermAction(formData: FormData) {
  await requireRole("owner", "admin");
  const name = String(formData.get("name") ?? "").trim();
  const schoolYear = String(formData.get("schoolYear") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "") || null;
  const endDate = String(formData.get("endDate") ?? "") || null;
  if (!name || !schoolYear) return;

  await db.insert(terms).values({ name, schoolYear, startDate, endDate });
  revalidatePath("/admin/terms");
}

export async function setTermActiveAction(termId: string, isActive: boolean) {
  await requireRole("owner", "admin");
  await db.update(terms).set({ isActive }).where(eq(terms.id, termId));
  revalidatePath("/admin/terms");
  revalidatePath("/board");
  revalidatePath("/matrix");
}

export async function upsertWeekAction(
  termId: string,
  weekNumber: number,
  uploadDeadline: string,
  cascade: boolean,
) {
  await requireRole("owner", "admin");

  await db
    .insert(termWeeks)
    .values({ termId, weekNumber, uploadDeadline })
    .onConflictDoUpdate({
      target: [termWeeks.termId, termWeeks.weekNumber],
      set: { uploadDeadline },
    });

  if (cascade) {
    await db
      .update(workItems)
      .set({ dueDate: uploadDeadline, updatedAt: new Date() })
      .where(
        and(
          eq(workItems.termId, termId),
          eq(workItems.weekNumber, weekNumber),
          notInArray(workItems.status, ["uploaded", "cancelled"]),
        ),
      );
  }

  revalidatePath("/admin/terms");
  revalidatePath("/board");
  revalidatePath("/matrix");
}

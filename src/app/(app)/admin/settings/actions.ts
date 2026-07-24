"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

export async function updateSettingsAction(formData: FormData) {
  await requireRole("owner");

  const quotaSize = Number(formData.get("quotaSize"));
  const wipLimit = Number(formData.get("wipLimit"));
  const dlpPoints = Number(formData.get("dlpPoints"));
  const cotPoints = Number(formData.get("cotPoints"));

  await Promise.all([
    db.insert(settings).values({ key: "quota_size", value: quotaSize }).onConflictDoUpdate({ target: settings.key, set: { value: quotaSize } }),
    db.insert(settings).values({ key: "wip_limit", value: wipLimit }).onConflictDoUpdate({ target: settings.key, set: { value: wipLimit } }),
    db
      .insert(settings)
      .values({ key: "points", value: { DLP: dlpPoints, COT: cotPoints } })
      .onConflictDoUpdate({ target: settings.key, set: { value: { DLP: dlpPoints, COT: cotPoints } } }),
  ]);

  revalidatePath("/admin/settings");
}

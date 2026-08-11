"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { ALL_DELIVERABLE_TYPES, COT_ALIGN_KEYS } from "@/lib/constants";

export async function updateSettingsAction(formData: FormData) {
  await requireRole("owner");

  const quotaSize = Number(formData.get("quotaSize"));
  const wipLimit = Number(formData.get("wipLimit"));
  const points = Object.fromEntries(
    [...ALL_DELIVERABLE_TYPES, ...COT_ALIGN_KEYS].map((key) => [key, Number(formData.get(`points_${key}`))]),
  );

  await Promise.all([
    db.insert(settings).values({ key: "quota_size", value: quotaSize }).onConflictDoUpdate({ target: settings.key, set: { value: quotaSize } }),
    db.insert(settings).values({ key: "wip_limit", value: wipLimit }).onConflictDoUpdate({ target: settings.key, set: { value: wipLimit } }),
    db.insert(settings).values({ key: "points", value: points }).onConflictDoUpdate({ target: settings.key, set: { value: points } }),
  ]);

  revalidatePath("/admin/settings");
}

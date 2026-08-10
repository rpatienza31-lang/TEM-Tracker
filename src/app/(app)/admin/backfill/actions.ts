"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { bulkBackfillWorkItems } from "@/lib/catalog/backfill";
import { bulkBackfillCotItems } from "@/lib/cot/backfill";

export type BackfillState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Bulk-marks the selected catalog items as done and credits them to one editor.
 * Owner/admin only. `markUploaded` sets them to uploaded (fully done) instead of
 * approved.
 */
export async function bulkBackfillAction(_prev: BackfillState, formData: FormData): Promise<BackfillState> {
  const actor = await requireRole("owner", "admin");

  const editorId = String(formData.get("editorId") ?? "");
  const markUploaded = String(formData.get("markUploaded") ?? "") === "1";
  const itemIds = formData.getAll("itemIds").map(String).filter(Boolean);

  if (!editorId) return { status: "error", message: "Choose an editor to credit." };
  if (itemIds.length === 0) return { status: "error", message: "Select at least one item." };

  const res = await bulkBackfillWorkItems({ itemIds, editorId, markUploaded, actor });
  revalidatePath("/admin/backfill");
  revalidatePath("/payroll");
  revalidatePath("/");
  const skipped = res.skipped > 0 ? ` (${res.skipped} already done, skipped)` : "";
  return { status: "ok", message: `Backfilled ${res.done} item(s)${skipped}.` };
}

/**
 * Bulk-marks the selected COT order items as done and credits them to one
 * editor. Owner/admin only. `markUploaded` sets them to uploaded (fully done)
 * instead of approved.
 */
export async function bulkBackfillCotAction(_prev: BackfillState, formData: FormData): Promise<BackfillState> {
  const actor = await requireRole("owner", "admin");

  const editorId = String(formData.get("editorId") ?? "");
  const markUploaded = String(formData.get("markUploaded") ?? "") === "1";
  const itemIds = formData.getAll("itemIds").map(String).filter(Boolean);

  if (!editorId) return { status: "error", message: "Choose an editor to credit." };
  if (itemIds.length === 0) return { status: "error", message: "Select at least one order." };

  const res = await bulkBackfillCotItems({ itemIds, editorId, markUploaded, actor });
  revalidatePath("/admin/backfill");
  revalidatePath("/cot");
  revalidatePath("/payroll");
  revalidatePath("/");
  const skipped = res.skipped > 0 ? ` (${res.skipped} already done, skipped)` : "";
  return { status: "ok", message: `Backfilled ${res.done} COT item(s)${skipped}.` };
}

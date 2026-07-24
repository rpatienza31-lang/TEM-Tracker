import { createClient } from "@/lib/supabase/client";

export const WORK_ITEM_FILES_BUCKET = "work-item-files";

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Uploads a work-item file directly to Supabase Storage from the browser and
 * returns its public URL (spec §9 Phase 4, optional "direct file upload").
 * Submission still just stores a URL in work_items.file_url — this only
 * changes where that URL points, so it degrades gracefully: if the bucket
 * isn't configured (e.g. a placeholder Supabase project), the caller can
 * fall back to the existing paste-a-link flow.
 */
export async function uploadWorkItemFile(itemId: string, file: File): Promise<UploadResult> {
  const supabase = createClient();
  const path = `${itemId}/${Date.now()}-${file.name}`;

  const { error } = await supabase.storage.from(WORK_ITEM_FILES_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  const { data } = supabase.storage.from(WORK_ITEM_FILES_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

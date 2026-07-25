"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { DEV_PREVIEW_COOKIE, DEV_PREVIEW_ENABLED } from "@/lib/dev-preview";

export async function setPreviewUserAction(email: string) {
  if (!DEV_PREVIEW_ENABLED) return;
  const cookieStore = await cookies();
  cookieStore.set(DEV_PREVIEW_COOKIE, email, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/", "layout");
}

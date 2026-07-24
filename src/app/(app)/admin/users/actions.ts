"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteUserState = { status: "idle" | "ok" | "error"; message?: string };

export async function inviteUserAction(_prev: InviteUserState, formData: FormData): Promise<InviteUserState> {
  await requireRole("owner", "admin");

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "editor") as (typeof users.$inferSelect)["role"];
  const payType = String(formData.get("payType") ?? "quota") as (typeof users.$inferSelect)["payType"];

  if (!email || !fullName) {
    return { status: "error", message: "Name and email are required." };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
    });
    if (error) {
      return { status: "error", message: error.message };
    }

    await db.insert(users).values({
      authUserId: data.user.id,
      email,
      fullName,
      role,
      payType,
    });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Failed to invite user." };
  }

  revalidatePath("/admin/users");
  return { status: "ok", message: `Invited ${email}.` };
}

export async function updateUserAction(
  userId: string,
  patch: Partial<Pick<typeof users.$inferSelect, "role" | "payType" | "isActive">>,
) {
  await requireRole("owner", "admin");
  await db.update(users).set(patch).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

"use server";

import { revalidatePath } from "next/cache";
import { eq, or } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users, workItems, workItemEvents, quotaCycles, timeLogs } from "@/db/schema";
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

    // Create the auth account directly instead of emailing an invite. Invite
    // emails go through the SMTP provider, which fails opaquely when the mail
    // service is rate-limited or bounces; creating the user is reliable, and
    // the owner then shares a sign-in link with `npm run login-link`.
    let authUserId: string;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });

    if (error) {
      // The email may already exist as an auth user (from an earlier attempt
      // or a login try). Reuse that account rather than failing.
      if (/registered|already|exists/i.test(error.message)) {
        const existingId = await findAuthUserIdByEmail(admin, email);
        if (!existingId) {
          return { status: "error", message: "That email is already in use but its account could not be found." };
        }
        authUserId = existingId;
      } else {
        return { status: "error", message: error.message?.trim() || "Could not create the account. Please try again." };
      }
    } else {
      authUserId = data.user.id;
    }

    const [existingAppUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authUserId, authUserId))
      .limit(1);
    if (existingAppUser) {
      return { status: "error", message: "This person is already added as a user." };
    }

    await db.insert(users).values({ authUserId, email, fullName, role, payType });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Failed to add user." };
  }

  revalidatePath("/admin/users");
  return { status: "ok", message: `Added ${email}. Send them a sign-in link: npm run login-link -- ${email}` };
}

/** Looks up an existing Supabase auth user id by email (small teams fit one page). */
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

export async function updateUserAction(
  userId: string,
  patch: Partial<Pick<typeof users.$inferSelect, "role" | "payType" | "isActive">>,
) {
  await requireRole("owner", "admin");
  await db.update(users).set(patch).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

export type DeleteUserResult = { ok: boolean; message?: string };

/**
 * Permanently removes a staff member — owner only. Refuses to delete anyone
 * who already has work, event, quota, or time-log history so payroll and the
 * audit trail stay intact (deactivate those instead). Also deletes their
 * Supabase auth account so the email can be re-used later. Notifications are
 * removed automatically by the ON DELETE CASCADE on their foreign key.
 */
export async function deleteUserAction(userId: string): Promise<DeleteUserResult> {
  const me = await requireRole("owner");

  if (userId === me.id) {
    return { ok: false, message: "You can't delete your own account." };
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    return { ok: false, message: "User not found." };
  }

  const [item, event, cycle, log] = await Promise.all([
    db.select({ id: workItems.id }).from(workItems).where(eq(workItems.assigneeId, userId)).limit(1),
    db.select({ id: workItemEvents.id }).from(workItemEvents).where(eq(workItemEvents.actorId, userId)).limit(1),
    db.select({ id: quotaCycles.id }).from(quotaCycles).where(eq(quotaCycles.editorId, userId)).limit(1),
    db
      .select({ id: timeLogs.id })
      .from(timeLogs)
      .where(or(eq(timeLogs.userId, userId), eq(timeLogs.approvedBy, userId)))
      .limit(1),
  ]);

  if (item.length || event.length || cycle.length || log.length) {
    return {
      ok: false,
      message:
        "This staff member already has work or payroll history. Deactivate them instead so their records stay intact.",
    };
  }

  if (target.authUserId) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(target.authUserId);
    // A missing auth user (already gone) shouldn't block removing the app row.
    if (error && !/not found/i.test(error.message)) {
      return { ok: false, message: `Could not delete the login account: ${error.message}` };
    }
  }

  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/users");
  return { ok: true };
}

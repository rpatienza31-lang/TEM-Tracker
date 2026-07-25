import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { DEV_PREVIEW_COOKIE, DEV_PREVIEW_ENABLED } from "@/lib/dev-preview";

export type AppUser = typeof users.$inferSelect;

/** The signed-in Supabase auth user joined to our `users` row, or null if not signed in / not provisioned. */
export async function getCurrentUser(): Promise<AppUser | null> {
  if (DEV_PREVIEW_ENABLED) {
    return getDevPreviewUser();
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [appUser] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  return appUser ?? null;
}

/** Impersonate a seeded user in dev preview mode (see src/lib/dev-preview.ts). */
async function getDevPreviewUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const email = cookieStore.get(DEV_PREVIEW_COOKIE)?.value ?? process.env.DEV_PREVIEW_EMAIL;

  if (email) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) return byEmail;
  }
  const [firstOwner] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
  if (firstOwner) return firstOwner;
  const [anyUser] = await db.select().from(users).orderBy(asc(users.fullName)).limit(1);
  return anyUser ?? null;
}

/** Same as getCurrentUser but redirects to /login (or /no-access) when unavailable. Use in server components/actions that require a session. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/no-access");
  return user;
}

export async function requireRole(...roles: AppUser["role"][]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

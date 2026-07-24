import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AppUser = typeof users.$inferSelect;

/** The signed-in Supabase auth user joined to our `users` row, or null if not signed in / not provisioned. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [appUser] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  return appUser ?? null;
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

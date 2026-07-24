import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Signs a Playwright page in as `email` without a real inbox, by having the
 * Supabase admin API mint a magic-link action link and driving the browser
 * straight to it (same link Supabase would otherwise email).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to point at a
 * real Supabase project with the test user already created (see
 * e2e/global-setup.ts) — this cannot run against a placeholder project.
 */
export async function loginAs(page: Page, email: string) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"}/auth/confirm` },
  });
  if (error || !data.properties?.action_link) {
    throw new Error(`Could not generate a login link for ${email}: ${error?.message}`);
  }

  await page.goto(data.properties.action_link);
  await page.waitForURL((url) => !url.pathname.startsWith("/login") && !url.pathname.startsWith("/auth"));
}

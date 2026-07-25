import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Handles both magic-link email formats so the app works against a default
 * Supabase project with no email-template edits:
 *
 *  - PKCE (`?code=...`): Supabase's default `{{ .ConfirmationURL }}` template
 *    routes through its own verify endpoint and redirects back here with an
 *    auth code, which we exchange for a session.
 *  - OTP (`?token_hash=...&type=...`): the custom template format from the
 *    Supabase server-side-auth guide, verified directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    redirect(`/login?error=invalid_link&reason=${encodeURIComponent(error.message)}`);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    redirect(`/login?error=invalid_link&reason=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?error=invalid_link");
}

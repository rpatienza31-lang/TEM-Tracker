import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env first, then let .env.local override it (matching Next.js's own
// precedence) so the generated link uses the production NEXT_PUBLIC_SITE_URL
// rather than falling back to localhost.
config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Prints a ready-to-click login link for a given email WITHOUT sending an
 * email — useful for the first owner/admin login, or any time Supabase's
 * built-in email service is rate-limited ("email rate limit exceeded").
 *
 * The user must already exist as a Supabase auth user (Dashboard →
 * Authentication → Users → Add user). Run:
 *
 *   npm run login-link -- you@email.com
 *
 * then paste the printed URL into the same browser where the app is open.
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run login-link -- you@email.com");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    console.error(`Could not generate a link: ${error.message}`);
    console.error("Make sure this email exists under Authentication → Users in your Supabase project.");
    process.exit(1);
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    console.error("Supabase did not return a token. Response:", JSON.stringify(data.properties, null, 2));
    process.exit(1);
  }

  const loginUrl = `${site}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/`;
  console.log(`\n✅ Paste this into the browser where the app is running to log in as ${email}:\n`);
  console.log(loginUrl);
  console.log("\n(The link is single-use and expires. Re-run this command to get a fresh one.)\n");
}

main();

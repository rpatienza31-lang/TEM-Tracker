/**
 * Dev-only preview mode.
 *
 * When DEV_PREVIEW=1 AND we're not in a production build, the app skips
 * Supabase auth entirely and instead impersonates a seeded user (chosen via a
 * cookie set by the on-screen user switcher, falling back to DEV_PREVIEW_EMAIL
 * then to the first owner). This lets someone click through the seeded data
 * without a real Supabase project.
 *
 * The `NODE_ENV !== "production"` guard means this can NEVER activate in a
 * production build, even if DEV_PREVIEW=1 leaks into a prod environment —
 * it's compiled out of the shipped bundle.
 */
export const DEV_PREVIEW_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.DEV_PREVIEW === "1";

export const DEV_PREVIEW_COOKIE = "dev_preview_email";

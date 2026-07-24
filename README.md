# TEM Tracker

Lesson Plan Production Tracker for Teacher Eva & Manuel Educational Services. See `SPEC.md`-equivalent context in the
project brief for the full product spec — this README covers local setup for **Phases 1–4** (foundation & the board;
deadlines & quota; payroll & hourly time logs; in-app notifications + direct file upload).

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS + hand-rolled shadcn/ui-style components (Radix primitives —
`ui.shadcn.com`'s registry isn't reachable from this environment, so the components under `src/components/ui` were
written by hand to match its conventions), Supabase (Postgres, Auth, Realtime), Drizzle ORM, Vitest, Playwright.

## Setup

1. Create a Supabase project. Copy `.env.example` to `.env` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` (Settings → Database → Connection
   string).
2. Apply the schema: `npm run db:push` (or run the files in `drizzle/` directly in the Supabase SQL editor, in order).
3. Apply Row Level Security and storage: run `supabase/sql/001_rls.sql`, then `002_seed_settings.sql`, then
   `003_storage.sql` in the Supabase SQL editor (these aren't Drizzle-managed — RLS policies and storage buckets
   aren't part of Drizzle's schema model). `003_storage.sql` creates the public `work-item-files` bucket that backs
   direct file upload in the submit dialog; without it, that dialog's "Upload" button fails gracefully and staff can
   still paste a link.
4. Seed sample data: `npm run db:seed`. This creates one owner, one admin, two sales, six editors, the subject master
   list, Term 1 (active) + Term 2 with weekly deadlines, and a realistic spread of work-item statuses so the board
   and matrix look real on first run. Seeded users get a random `auth_user_id` placeholder and can't log in until
   invited for real via **Admin → Users** (which creates a matching Supabase Auth account and sends a magic link).
5. `npm run dev` and open http://localhost:3000.

## Testing

- `npm test` — Vitest business-logic suite (transition service, WIP limit, atomic-claim race, catalog-generator
  idempotency, quota-cycle math incl. carry-over/reversal, deadline buckets, payroll-vs-productivity reconciliation).
  Requires `TEST_DATABASE_URL` in `.env`, pointed at a **disposable** Postgres database (must contain "test" in its
  name — the suite truncates tables between runs). Never point this at your dev/prod database.
- `npm run test:e2e` — Playwright concurrency test (`e2e/concurrency.spec.ts`). This drives two real authenticated
  browser sessions, so it needs a real Supabase project (not a placeholder) with `SUPABASE_SERVICE_ROLE_KEY` set and
  the database seeded (`npm run db:seed`) — it mints login links via the Supabase admin API instead of real email.

## Repo layout

- `src/db/schema.ts` — Drizzle schema (spec §5). `drizzle/` holds the generated SQL migration.
- `supabase/sql/` — RLS policies + settings seed, applied by hand (see Setup above).
- `src/lib/work-items/transitions.ts` — `transitionWorkItem()`, the single service every status change goes through
  (atomic claim guard, WIP limit, event log). `src/lib/work-items/actions.ts` wraps it as Server Actions.
- `src/lib/catalog/generator.ts` — the catalog generator's preview/generate logic (idempotent via
  `ON CONFLICT DO NOTHING` against the natural-key unique constraint on `work_items`).
- `src/lib/quota/cycles.ts` — quota-cycle point awarding on approve, with close/carry-over and cascading
  un-approve/release reversal (spec §6.4). `src/lib/quota/productivity.ts` backs the Productivity & Quota screen.
- `src/lib/time-logs/` — hourly staff self-service time entry + admin approval. `src/lib/payroll/report.ts` builds the
  payroll-period report (reuses the same quota data the Productivity screen reads, so the two always reconcile) and
  its CSV rendering, served by `src/app/api/payroll/export/route.ts`.
- `src/lib/notifications/` — event-driven notifications (revision requested / approved / unapproved) plus computed
  "live alerts" (overdue, unclaimed-at-risk, due-soon), surfaced by the bell in `src/components/notification-bell.tsx`.
- `src/lib/storage/upload.ts` — direct file upload to Supabase Storage from the submit dialog; falls back to the
  paste-a-link flow on any error (e.g. the bucket isn't configured).
- `src/app/(app)/` — authenticated screens: dashboard, board, matrix, my-work, review, productivity, time-logs,
  payroll, admin/*.
- `scripts/seed.ts` — the seed script described above.

## Deliverable types (owner clarification, supersedes spec §4)

The spec's §4 DECISION bundled a DLP and its paired PPT into one work item worth 1 point, with COT as a separate
0.5-point item. The owner clarified this should instead be **four independent, separately claimable/submittable/
approvable work items** per grade × subject × week: `DLP` (1 pt), `PPT` (1 pt), `COT_DLP` (0.5 pt), `COT_PPT`
(0.5 pt). Each is its own row on the board/matrix with its own status lifecycle; `work_items.file_url` holds a
single link per item (no more paired `dlp_url`/`ppt_url`). The catalog generator always creates DLP + PPT for every
selected subject, with COT-DLP and COT-PPT as independent per-subject opt-ins (mirroring the original "COT optional"
behavior, just doubled).

## What's not in Phase 1/2/3/4 yet

- **Scheduled email reminders.** The spec's Phase 4 notification goal includes deadline reminders on a schedule;
  what's built is event-driven in-app notifications plus alerts computed on page load. A scheduled digest would need
  a cron job (e.g. Vercel Cron) and an email provider (Resend, SendGrid, …) — nothing in this environment has
  credentials for either, so it's left as a follow-up once the owner picks a provider.
- **Sales inquiry tracking.** Listed as an optional Phase 4 item, but §3 of the spec explicitly calls CRM/inquiry
  management a v1 non-goal, so it was skipped rather than guessed at.

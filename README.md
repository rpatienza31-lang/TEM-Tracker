# TEM Tracker

Lesson Plan Production Tracker for Teacher Eva & Manuel Educational Services. See `SPEC.md`-equivalent context in the
project brief for the full product spec — this README covers local setup for **Phase 1** (foundation & the board).

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS + hand-rolled shadcn/ui-style components (Radix primitives —
`ui.shadcn.com`'s registry isn't reachable from this environment, so the components under `src/components/ui` were
written by hand to match its conventions), Supabase (Postgres, Auth, Realtime), Drizzle ORM, Vitest, Playwright.

## Setup

1. Create a Supabase project. Copy `.env.example` to `.env` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` (Settings → Database → Connection
   string).
2. Apply the schema: `npm run db:push` (or run `drizzle/0000_pink_onslaught.sql` directly in the Supabase SQL editor).
3. Apply Row Level Security: run `supabase/sql/001_rls.sql` then `supabase/sql/002_seed_settings.sql` in the Supabase
   SQL editor (these aren't Drizzle-managed since Drizzle doesn't model policies).
4. Seed sample data: `npm run db:seed`. This creates one owner, one admin, two sales, six editors, the subject master
   list, Term 1 (active) + Term 2 with weekly deadlines, and a realistic spread of work-item statuses so the board
   and matrix look real on first run. Seeded users get a random `auth_user_id` placeholder and can't log in until
   invited for real via **Admin → Users** (which creates a matching Supabase Auth account and sends a magic link).
5. `npm run dev` and open http://localhost:3000.

## Testing

- `npm test` — Vitest business-logic suite (transition service, WIP limit, atomic-claim race, catalog-generator
  idempotency). Requires `TEST_DATABASE_URL` in `.env`, pointed at a **disposable** Postgres database (must contain
  "test" in its name — the suite truncates tables between runs). Never point this at your dev/prod database.
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
- `src/app/(app)/` — authenticated screens: dashboard, board, matrix, my-work, review, admin/*.
- `scripts/seed.ts` — the seed script described above.

## What's not in Phase 1

Quota-cycle point awarding, payroll, hourly time logs, and notifications are Phase 2/3 per the spec's phased build
plan — the schema and screen stubs are in place, but the business logic isn't wired up yet.

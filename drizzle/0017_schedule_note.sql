-- A per-item note shown on the Project Schedule card.
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "schedule_note" text;

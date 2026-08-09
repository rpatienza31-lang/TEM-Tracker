ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "scheduled_for" date;
CREATE INDEX IF NOT EXISTS "work_items_scheduled_for_idx" ON "work_items" ("scheduled_for");

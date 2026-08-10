-- Deadlines are no longer set in the catalog generator; they are set when the
-- owner/admin assigns or schedules an item, and that same date drives the
-- Project Schedule. So make due_date nullable and drop the short-lived,
-- now-redundant scheduled_for column.
ALTER TABLE "work_items" ALTER COLUMN "due_date" DROP NOT NULL;
DROP INDEX IF EXISTS "work_items_scheduled_for_idx";
ALTER TABLE "work_items" DROP COLUMN IF EXISTS "scheduled_for";
CREATE INDEX IF NOT EXISTS "work_items_due_date_idx" ON "work_items" ("due_date");

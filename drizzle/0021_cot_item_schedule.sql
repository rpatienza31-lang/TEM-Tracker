-- Per-deliverable schedule day for COT items, so DLP and PPT of one order can
-- sit on different days of the Project Schedule (falls back to the order deadline).
ALTER TABLE "custom_order_items" ADD COLUMN IF NOT EXISTS "scheduled_for" date;

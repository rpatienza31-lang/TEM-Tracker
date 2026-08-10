-- Allow weeks 1–14 (was 1–10) so the catalog can cover longer terms.
ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "work_items_week_number_check";
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_week_number_check" CHECK ("week_number" between 1 and 14);
ALTER TABLE "term_weeks" DROP CONSTRAINT IF EXISTS "term_weeks_week_number_check";
ALTER TABLE "term_weeks" ADD CONSTRAINT "term_weeks_week_number_check" CHECK ("week_number" between 1 and 14);

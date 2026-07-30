-- "Lesson For" from the COT order form (typically "Reclass" or "Demo").
ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "lesson_for" text;

-- COT orders: mark work as brand-new or an alignment of an existing lesson.
DO $$ BEGIN
  CREATE TYPE "cot_work_kind" AS ENUM ('new', 'align');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "work_kind" "cot_work_kind" NOT NULL DEFAULT 'new';

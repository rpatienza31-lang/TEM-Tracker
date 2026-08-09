ALTER TABLE "payroll_payments" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'quota' NOT NULL;

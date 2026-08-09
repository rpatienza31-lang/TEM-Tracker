ALTER TABLE "payroll_payments" ADD COLUMN IF NOT EXISTS "cash_advance" numeric(12, 2) DEFAULT '0' NOT NULL;

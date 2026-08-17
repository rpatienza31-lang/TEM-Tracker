-- Lets an employee confirm they received a payout; the timestamp reflects that
-- acknowledgement back in Payment history.
ALTER TABLE "payroll_payments" ADD COLUMN IF NOT EXISTS "received_at" timestamptz;

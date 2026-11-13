-- Description for a cash advance, so the owner knows what it's for and it can
-- print on the payslip. One live note per staffer, plus a snapshot on each payout.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_advance_note text;
ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS cash_advance_note text;

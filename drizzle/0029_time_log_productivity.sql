-- Productivity report entered by staff at clock-out (required to clock out).
-- Visible to admins on the payroll "Productivity reports" view.
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS productivity text;

-- Two-way time-log approval: an approved session may count toward hourly pay
-- ("Hourly (paid)") or be attendance-only monitoring for a quota staffer
-- (₱0 hourly). Existing approved rows keep their old behavior (paid) via the
-- default true.
ALTER TABLE "time_logs" ADD COLUMN IF NOT EXISTS "counts_hourly" boolean NOT NULL DEFAULT true;

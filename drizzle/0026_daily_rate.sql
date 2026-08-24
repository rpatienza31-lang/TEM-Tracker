-- Fixed daily pay rate for time-only staff (paid per day present).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_rate" numeric(10, 2) DEFAULT '0' NOT NULL;

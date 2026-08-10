-- Staff non-working days on the Project Schedule (day off, vacation, school, absent).
DO $$ BEGIN
  CREATE TYPE "availability_kind" AS ENUM ('day_off', 'vacation', 'school', 'absent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "staff_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "editor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "kind" "availability_kind" NOT NULL,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "staff_availability_editor_date_key" UNIQUE ("editor_id", "date")
);
CREATE INDEX IF NOT EXISTS "staff_availability_date_idx" ON "staff_availability" ("date");

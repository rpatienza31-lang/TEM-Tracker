-- Personal admin checklist items pinned to a Project Schedule day, togglable
-- done/pending, shown in the owner's own column.
CREATE TABLE IF NOT EXISTS "schedule_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "title" text NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "schedule_tasks_user_date_idx" ON "schedule_tasks" ("user_id", "date");

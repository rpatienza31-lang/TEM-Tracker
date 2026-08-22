-- Priority level (high/medium/low) for schedule checklist tasks, so admins can
-- see what to do first.
ALTER TABLE "schedule_tasks" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'medium' NOT NULL;

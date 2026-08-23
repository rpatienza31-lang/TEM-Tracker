-- Office/time-only staff role: can clock in/out and see their hours, but is not
-- an editor and never appears in assignee lists.
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'staff';

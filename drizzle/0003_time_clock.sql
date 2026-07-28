ALTER TABLE "time_logs" ADD COLUMN "clock_in" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_logs" ADD COLUMN "clock_out" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_logs" ALTER COLUMN "hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "time_logs" DROP CONSTRAINT "time_logs_hours_check";--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_hours_check" CHECK ("hours" IS NULL OR ("hours" > 0 AND "hours" <= 24));

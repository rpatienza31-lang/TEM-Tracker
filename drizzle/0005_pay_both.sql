ALTER TYPE "pay_type" ADD VALUE IF NOT EXISTS 'both';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hourly_rate" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cycle_rate" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "hourly_rate" = "rate" WHERE "pay_type" = 'hourly';--> statement-breakpoint
UPDATE "users" SET "cycle_rate" = "rate" WHERE "pay_type" = 'quota';

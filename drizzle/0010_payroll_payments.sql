CREATE TABLE IF NOT EXISTS "payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"editor_id" uuid NOT NULL,
	"cycles" integer NOT NULL,
	"points" numeric(8, 2) NOT NULL,
	"rate" numeric(10, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"period_from" date,
	"period_to" date,
	"paid_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_payments_editor_idx" ON "payroll_payments" ("editor_id","paid_at");

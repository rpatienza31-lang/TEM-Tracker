CREATE TABLE IF NOT EXISTS "point_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"editor_id" uuid NOT NULL,
	"cycle_id" uuid,
	"points" numeric(5, 2) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_cycle_id_quota_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "quota_cycles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "point_adjustments_editor_created_idx" ON "point_adjustments" ("editor_id","created_at");

CREATE TYPE "public"."deliverable_type" AS ENUM('DLP', 'PPT', 'COT_DLP', 'COT_PPT');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('available', 'claimed', 'in_review', 'revision', 'approved', 'uploaded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pay_type" AS ENUM('hourly', 'quota');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'sales', 'editor');--> statement-breakpoint
CREATE TABLE "quota_cycle_items" (
	"cycle_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"points" numeric(4, 2) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_cycle_items_work_item_id_pk" PRIMARY KEY("work_item_id")
);
--> statement-breakpoint
CREATE TABLE "quota_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"editor_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"target_points" numeric(5, 2) DEFAULT '21' NOT NULL,
	"points_total" numeric(5, 2) DEFAULT '0' NOT NULL,
	"carried_in" numeric(5, 2) DEFAULT '0' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"is_closed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "quota_cycles_editor_cycle_key" UNIQUE("editor_id","cycle_number")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subjects_name_unique" UNIQUE("name"),
	CONSTRAINT "subjects_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "term_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "term_offerings_term_grade_subject_key" UNIQUE("term_id","grade","subject_id"),
	CONSTRAINT "term_offerings_grade_check" CHECK ("term_offerings"."grade" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "term_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"upload_deadline" date NOT NULL,
	CONSTRAINT "term_weeks_term_week_key" UNIQUE("term_id","week_number"),
	CONSTRAINT "term_weeks_week_number_check" CHECK ("term_weeks"."week_number" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"school_year" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"note" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_logs_hours_check" CHECK ("time_logs"."hours" > 0 and "time_logs"."hours" <= 24)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"pay_type" "pay_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"actor_id" uuid,
	"from_status" "item_status",
	"to_status" "item_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"status" "item_status" DEFAULT 'available' NOT NULL,
	"assignee_id" uuid,
	"claimed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone,
	"due_date" date NOT NULL,
	"points_value" numeric(4, 2) NOT NULL,
	"points_awarded" numeric(4, 2),
	"file_url" text,
	"notes" text,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_natural_key" UNIQUE("term_id","grade","subject_id","week_number","type"),
	CONSTRAINT "work_items_week_number_check" CHECK ("work_items"."week_number" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "quota_cycle_items" ADD CONSTRAINT "quota_cycle_items_cycle_id_quota_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."quota_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_cycle_items" ADD CONSTRAINT "quota_cycle_items_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_cycles" ADD CONSTRAINT "quota_cycles_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_offerings" ADD CONSTRAINT "term_offerings_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_offerings" ADD CONSTRAINT "term_offerings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_weeks" ADD CONSTRAINT "term_weeks_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_items_term_status_idx" ON "work_items" USING btree ("term_id","status");--> statement-breakpoint
CREATE INDEX "work_items_assignee_status_idx" ON "work_items" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "work_items_term_week_grade_idx" ON "work_items" USING btree ("term_id","week_number","grade");
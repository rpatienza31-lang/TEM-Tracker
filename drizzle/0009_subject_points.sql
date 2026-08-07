CREATE TABLE IF NOT EXISTS "subject_points" (
	"subject_id" uuid NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"points" numeric(4, 2) NOT NULL,
	CONSTRAINT "subject_points_subject_id_type_pk" PRIMARY KEY("subject_id","type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_points" ADD CONSTRAINT "subject_points_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

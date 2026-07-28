CREATE TYPE "public"."order_type" AS ENUM('rush', 'regular');--> statement-breakpoint
CREATE TABLE "custom_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"customer_name" text NOT NULL,
	"grade" integer,
	"subject_name" text,
	"topic" text,
	"competency" text,
	"indicator" text,
	"notes" text,
	"payment" numeric(10, 2),
	"order_type" "order_type" DEFAULT 'regular' NOT NULL,
	"order_date" date NOT NULL,
	"deadline" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_orders_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "custom_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"status" "item_status" DEFAULT 'available' NOT NULL,
	"assignee_id" uuid,
	"claimed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"file_url" text,
	"points_value" numeric(4, 2) DEFAULT '0.5' NOT NULL,
	"points_awarded" numeric(4, 2),
	"awarded_cycle_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_order_items_order_type_key" UNIQUE("order_id","type")
);
--> statement-breakpoint
ALTER TABLE "custom_order_items" ADD CONSTRAINT "custom_order_items_order_id_custom_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."custom_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_order_items" ADD CONSTRAINT "custom_order_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_order_items" ADD CONSTRAINT "custom_order_items_awarded_cycle_id_quota_cycles_id_fk" FOREIGN KEY ("awarded_cycle_id") REFERENCES "public"."quota_cycles"("id") ON DELETE no action ON UPDATE no action;

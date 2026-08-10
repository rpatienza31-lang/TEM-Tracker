-- A per-order note shown on the Project Schedule card for COT orders.
ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "schedule_note" text;

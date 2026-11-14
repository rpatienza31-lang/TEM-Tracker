-- Red alert for a COT order: a customer urgently following up for their files.
-- Sales (or an admin/owner) raises it; admins are notified and it's prioritized.
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS red_alert boolean NOT NULL DEFAULT false;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS red_alert_note text;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS red_alert_by uuid REFERENCES users(id);
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS red_alert_at timestamptz;

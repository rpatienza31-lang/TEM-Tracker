-- Audit of Project Schedule actions: who scheduled (set a deadline/day), who
-- assigned an editor, who sent back for revision — for catalog and COT items.
-- item_id is the deliverable id (work_items.id or custom_order_items.id).
CREATE TABLE IF NOT EXISTS schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind text NOT NULL,
  item_id uuid NOT NULL,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_events_item_idx ON schedule_events (item_id, created_at);

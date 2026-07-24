-- Seed default settings (spec §5 comment) and enable Realtime on work_items
-- so the board / matrix view can subscribe to postgres_changes.
insert into settings (key, value) values
  ('quota_size', '21'),
  ('points', '{"DLP": 1, "PPT": 1, "COT_DLP": 0.5, "COT_PPT": 0.5}'),
  ('wip_limit', '5')
on conflict (key) do nothing;

alter publication supabase_realtime add table work_items;

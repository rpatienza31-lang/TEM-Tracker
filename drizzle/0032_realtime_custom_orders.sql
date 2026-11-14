-- Stream COT order changes over Supabase realtime, so a newly raised red alert
-- updates the notification bell (and chimes) live. Safe if already added.
ALTER PUBLICATION supabase_realtime ADD TABLE custom_orders;

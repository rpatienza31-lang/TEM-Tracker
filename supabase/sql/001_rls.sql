-- Row Level Security policies (spec §10).
-- Run after the Drizzle migration (drizzle/0000_*.sql) has created the tables.
-- Apply via the Supabase SQL editor or: psql "$DATABASE_URL" -f supabase/sql/001_rls.sql

-- ---------------------------------------------------------------------------
-- Helper functions: map the Supabase auth session to our `users` row.
-- ---------------------------------------------------------------------------
create or replace function app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from users where auth_user_id = auth.uid();
$$;

create or replace function app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from users where auth_user_id = auth.uid();
$$;

create or replace function app_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from users where auth_user_id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table users             enable row level security;
alter table terms             enable row level security;
alter table subjects          enable row level security;
alter table term_offerings    enable row level security;
alter table term_weeks        enable row level security;
alter table work_items        enable row level security;
alter table work_item_events  enable row level security;
alter table quota_cycles      enable row level security;
alter table quota_cycle_items enable row level security;
alter table time_logs         enable row level security;
alter table settings          enable row level security;

-- ---------------------------------------------------------------------------
-- users: everyone active can read the staff directory (needed for assignee
-- names on the board); only owner/admin can write.
-- ---------------------------------------------------------------------------
create policy users_select on users
  for select using (app_is_active());

create policy users_write_admin on users
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- terms / subjects / term_offerings / term_weeks: read-only reference data
-- for all active staff; writes restricted to owner/admin.
-- ---------------------------------------------------------------------------
create policy terms_select on terms
  for select using (app_is_active());
create policy terms_write_admin on terms
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

create policy subjects_select on subjects
  for select using (app_is_active());
create policy subjects_write_admin on subjects
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

create policy term_offerings_select on term_offerings
  for select using (app_is_active());
create policy term_offerings_write_admin on term_offerings
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

create policy term_weeks_select on term_weeks
  for select using (app_is_active());
create policy term_weeks_write_admin on term_weeks
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- work_items:
--   - editors: read all items in active terms; update only their own rows,
--     or claim an available+unassigned row (WITH CHECK still requires the
--     resulting assignee to be themselves).
--   - admin/owner: full read/write.
-- Note: the actual atomic claim UPDATE (status='available' AND assignee_id
-- IS NULL guard) is enforced by transitionWorkItem() at the application
-- layer over a direct Postgres connection; these policies are the
-- defense-in-depth layer for any direct Supabase client access (e.g. the
-- realtime subscription's underlying SELECT).
-- ---------------------------------------------------------------------------
create policy work_items_select on work_items
  for select using (
    app_is_active()
    and exists (select 1 from terms t where t.id = work_items.term_id and t.is_active)
  );

create policy work_items_update_editor on work_items
  for update using (
    app_role() = 'editor'
    and (assignee_id = app_user_id() or (status = 'available' and assignee_id is null))
  )
  with check (
    app_role() = 'editor'
    and assignee_id = app_user_id()
  );

create policy work_items_all_admin on work_items
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- work_item_events: append-only audit trail. Everyone active can read;
-- inserts happen only through the service layer (owner/admin/editor acting
-- on their own item).
-- ---------------------------------------------------------------------------
create policy work_item_events_select on work_item_events
  for select using (app_is_active());

create policy work_item_events_insert on work_item_events
  for insert with check (
    app_role() in ('owner','admin')
    or actor_id = app_user_id()
  );

-- ---------------------------------------------------------------------------
-- quota_cycles / quota_cycle_items: editors read only their own; owner/admin
-- read/write everything (payroll).
-- ---------------------------------------------------------------------------
create policy quota_cycles_select_self on quota_cycles
  for select using (editor_id = app_user_id());
create policy quota_cycles_all_admin on quota_cycles
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

create policy quota_cycle_items_select_self on quota_cycle_items
  for select using (
    exists (select 1 from quota_cycles qc where qc.id = quota_cycle_items.cycle_id and qc.editor_id = app_user_id())
  );
create policy quota_cycle_items_all_admin on quota_cycle_items
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- time_logs: staff read/insert their own; owner/admin read/write all
-- (approval).
-- ---------------------------------------------------------------------------
create policy time_logs_select_self on time_logs
  for select using (user_id = app_user_id());
create policy time_logs_insert_self on time_logs
  for insert with check (user_id = app_user_id());
create policy time_logs_all_admin on time_logs
  for all using (app_role() in ('owner','admin'))
  with check (app_role() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- settings: owner only (payroll-adjacent: quota size, point values, WIP
-- limit). Admin has no access per spec §10.
-- ---------------------------------------------------------------------------
create policy settings_all_owner on settings
  for all using (app_role() = 'owner')
  with check (app_role() = 'owner');

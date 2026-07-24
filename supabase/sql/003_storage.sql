-- Direct file upload to Supabase Storage (spec §9 Phase 4, optional).
-- Bucket is public-read so a stored file behaves like the Google Drive
-- links the app already assumes ("anyone with the link"): staff upload
-- through the authenticated app UI, and the resulting URL is what gets
-- saved into work_items.file_url — no signed-URL refresh logic needed.
-- Run after 001_rls.sql / 002_seed_settings.sql.

insert into storage.buckets (id, name, public)
values ('work-item-files', 'work-item-files', true)
on conflict (id) do nothing;

-- Anyone active can read (matches work_items_select's own-org visibility).
create policy work_item_files_read on storage.objects
  for select using (bucket_id = 'work-item-files' and app_is_active());

-- Any active staff member can upload — the object path is namespaced by
-- work_item_id (see src/lib/storage/upload.ts), so this isn't scoped further
-- than "you're logged in"; the transitionWorkItem() submit step still
-- enforces who may attach a file to a given item.
create policy work_item_files_insert on storage.objects
  for insert with check (bucket_id = 'work-item-files' and app_is_active());

-- Owner/admin can remove files (e.g. cleaning up after a release/cancel);
-- editors don't get delete since a submitted file becomes part of the record.
create policy work_item_files_delete_admin on storage.objects
  for delete using (bucket_id = 'work-item-files' and app_role() in ('owner','admin'));

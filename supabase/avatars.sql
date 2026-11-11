-- Atlantic profile photo storage
-- Run this once in Supabase SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlantic-avatars',
  'atlantic-avatars',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Atlantic avatar owners can upload" on storage.objects;
create policy "Atlantic avatar owners can upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'atlantic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Atlantic avatar owners can update" on storage.objects;
create policy "Atlantic avatar owners can update"
on storage.objects for update to authenticated
using (
  bucket_id = 'atlantic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'atlantic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Atlantic avatar owners can delete" on storage.objects;
create policy "Atlantic avatar owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'atlantic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Add public media support for Atlantic Stories.
alter table public.atlantic_stories
  drop constraint if exists atlantic_stories_body_check;

alter table public.atlantic_stories
  add constraint atlantic_stories_body_or_media_check
  check (
    (char_length(body) between 1 and 500)
    or (media_url is not null and char_length(body) = 0)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlantic-stories',
  'atlantic-stories',
  true,
  20971520,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update
set public = true,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Atlantic users upload own story media" on storage.objects;
create policy "Atlantic users upload own story media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'atlantic-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Atlantic users delete own story media" on storage.objects;
create policy "Atlantic users delete own story media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'atlantic-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

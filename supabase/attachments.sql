-- Atlantic private chat attachments
-- Run this once in Supabase Dashboard > SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlantic-attachments',
  'atlantic-attachments',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Atlantic conversation members can upload files" on storage.objects;
create policy "Atlantic conversation members can upload files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'atlantic-attachments'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Atlantic conversation members can read files" on storage.objects;
create policy "Atlantic conversation members can read files"
on storage.objects for select to authenticated
using (
  bucket_id = 'atlantic-attachments'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Atlantic users can delete their own uploads" on storage.objects;
create policy "Atlantic users can delete their own uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'atlantic-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

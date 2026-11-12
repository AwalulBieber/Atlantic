-- Keep Atlantic Story media private and only sign URLs while the Story is active.
update storage.buckets
set public = false
where id = 'atlantic-stories';

drop policy if exists "Atlantic users read active story media" on storage.objects;
create policy "Atlantic users read active story media"
on storage.objects for select to authenticated
using (
  bucket_id = 'atlantic-stories'
  and exists (
    select 1
    from public.atlantic_stories s
    where s.media_url = storage.objects.name
      and s.expires_at > now()
  )
);

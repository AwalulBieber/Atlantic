-- Allow opaque E2EE attachment ciphertext in the private chat-media bucket.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['application/octet-stream']::text[]) as mime
)
where id = 'atlantic-chat-media';

-- Reduce accidental access granted to anonymous users on future objects.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

-- Supabase-managed ownership may restrict changes; record inability without
-- blocking the other safe changes in this migration.
do $$
begin
  begin
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from anon';
  exception when insufficient_privilege or undefined_object then
    raise notice 'Could not adjust supabase_admin default privileges with current database role; owner action required.';
  end;
end
$$;

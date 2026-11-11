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


-- Protected Atlantic admin registry. Only this table grants admin badge status.
create table if not exists public.atlantic_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.atlantic_admins enable row level security;
revoke all on public.atlantic_admins from anon, authenticated;

-- Register the designated primary admin account.
insert into public.atlantic_admins (user_id)
select id from auth.users
where lower(email) = lower('awalulhakim94@gmail.com')
on conflict (user_id) do nothing;

-- Securely check the badge for any profile, without exposing the admin table.
create or replace function public.is_atlantic_admin(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.atlantic_admins a where a.user_id = target_user
  );
$$;

-- Keep the no-argument version used by account settings.
create or replace function public.is_atlantic_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_atlantic_admin(auth.uid());
$$;

revoke all on function public.is_atlantic_admin(uuid) from public;
revoke all on function public.is_atlantic_admin() from public;
grant execute on function public.is_atlantic_admin(uuid) to authenticated;
grant execute on function public.is_atlantic_admin() to authenticated;


-- Also register the primary admin automatically if that account is created later.
create or replace function public.register_primary_atlantic_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = lower('awalulhakim94@gmail.com') then
    insert into public.atlantic_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_register_primary_atlantic_admin on auth.users;
create trigger on_auth_user_register_primary_atlantic_admin
after insert or update of email on auth.users
for each row execute function public.register_primary_atlantic_admin();

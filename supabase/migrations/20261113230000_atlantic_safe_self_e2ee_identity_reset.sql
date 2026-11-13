-- Safe self-service E2EE identity reset for accounts that have lost their old device.
-- Old recovery ciphertext is archived; resets are blocked once any conversation
-- key or historical key epoch exists for one of the user's conversations.

create table if not exists public.profile_e2ee_recovery_backup_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup jsonb not null,
  archived_at timestamptz not null default now()
);

alter table public.profile_e2ee_recovery_backup_archive enable row level security;
revoke all on table public.profile_e2ee_recovery_backup_archive from public, anon, authenticated;
grant select on table public.profile_e2ee_recovery_backup_archive to authenticated;
drop policy if exists "Users can read their own archived E2EE backups" on public.profile_e2ee_recovery_backup_archive;
create policy "Users can read their own archived E2EE backups"
on public.profile_e2ee_recovery_backup_archive
for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.prevent_e2ee_identity_key_replacement()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.e2ee_public_key is not null
     and new.e2ee_public_key is distinct from old.e2ee_public_key then
    if (select auth.uid()) is distinct from old.id
       or current_setting('app.atlantic_e2ee_identity_reset', true) is distinct from 'on' then
      raise exception 'E2EE identity keys are immutable; use the verified self-service reset flow.';
    end if;
    if exists (
      select 1
      from public.conversation_members cm
      join public.conversation_e2ee_keys k on k.conversation_id = cm.conversation_id
      where cm.user_id = old.id
    ) or exists (
      select 1
      from public.conversation_members cm
      join public.conversation_e2ee_key_epochs e on e.conversation_id = cm.conversation_id
      where cm.user_id = old.id
    ) then
      raise exception 'E2EE identity reset is blocked because conversation keys already exist.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.reset_own_e2ee_identity(
  p_public_key jsonb,
  p_backup jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing_key jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_public_key) <> 'object'
     or p_public_key->>'kty' <> 'EC'
     or p_public_key->>'crv' <> 'P-256'
     or coalesce(p_public_key->>'x','') = ''
     or coalesce(p_public_key->>'y','') = '' then
    raise exception 'Invalid E2EE public key';
  end if;
  if jsonb_typeof(p_backup) <> 'object'
     or p_backup->>'version' <> '2'
     or p_backup->>'kdf' <> 'PBKDF2-SHA256'
     or coalesce((p_backup->>'iterations')::integer,0) not between 100000 and 1000000
     or not (p_backup ?& array['salt','iv','ciphertext','publicJwk'])
     or p_backup->'publicJwk' <> p_public_key
     or pg_column_size(p_backup) >= 16384 then
    raise exception 'Invalid E2EE recovery backup';
  end if;

  select e2ee_public_key into v_existing_key
  from public.profiles
  where id = v_user_id
  for update;
  if not found or v_existing_key is null then
    raise exception 'Existing E2EE identity not found';
  end if;

  -- Do not replace a key if any current or archived conversation epoch depends on it.
  perform 1 from public.conversation_members
  where user_id = v_user_id
  for update;
  if exists (
    select 1
    from public.conversation_members cm
    join public.conversation_e2ee_keys k on k.conversation_id = cm.conversation_id
    where cm.user_id = v_user_id
  ) or exists (
    select 1
    from public.conversation_members cm
    join public.conversation_e2ee_key_epochs e on e.conversation_id = cm.conversation_id
    where cm.user_id = v_user_id
  ) then
    raise exception 'Reset blocked: conversation key history exists. Recover or rotate those rooms first.';
  end if;

  insert into public.profile_e2ee_recovery_backup_archive(user_id, backup)
  select user_id, backup
  from public.profile_e2ee_recovery_backups
  where user_id = v_user_id;

  perform set_config('app.atlantic_e2ee_identity_reset', 'on', true);
  update public.profiles
  set e2ee_public_key = p_public_key
  where id = v_user_id;

  insert into public.profile_e2ee_recovery_backups(user_id, backup, updated_at)
  values (v_user_id, p_backup, now())
  on conflict (user_id) do update
    set backup = excluded.backup,
        updated_at = now();

  return true;
end;
$function$;

revoke all on function public.reset_own_e2ee_identity(jsonb,jsonb) from public, anon;
grant execute on function public.reset_own_e2ee_identity(jsonb,jsonb) to authenticated;

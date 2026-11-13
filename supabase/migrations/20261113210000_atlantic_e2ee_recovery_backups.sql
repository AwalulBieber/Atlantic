create table if not exists public.profile_e2ee_recovery_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  backup jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_e2ee_recovery_backups_shape check (
    jsonb_typeof(backup) = 'object'
    and backup->>'version' = '1'
    and backup->>'kdf' = 'PBKDF2-SHA256'
    and backup ?& array['iterations','salt','iv','ciphertext','publicJwk']
    and pg_column_size(backup) < 16384
  )
);

alter table public.profile_e2ee_recovery_backups enable row level security;
revoke all on table public.profile_e2ee_recovery_backups from public, anon, authenticated;
grant select, insert, update on table public.profile_e2ee_recovery_backups to authenticated;

drop policy if exists "Users can read their own E2EE recovery backup" on public.profile_e2ee_recovery_backups;
create policy "Users can read their own E2EE recovery backup"
on public.profile_e2ee_recovery_backups for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own E2EE recovery backup" on public.profile_e2ee_recovery_backups;
create policy "Users can create their own E2EE recovery backup"
on public.profile_e2ee_recovery_backups for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own E2EE recovery backup" on public.profile_e2ee_recovery_backups;
create policy "Users can update their own E2EE recovery backup"
on public.profile_e2ee_recovery_backups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Atlantic user verification workflow: regular users apply, admins approve.
alter table public.profiles add column if not exists is_verified boolean not null default false;
create table if not exists public.atlantic_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text not null default '' check (char_length(review_note) <= 500)
);
create index if not exists atlantic_verification_requests_queue_idx on public.atlantic_verification_requests(status, requested_at desc);
create unique index if not exists atlantic_one_pending_verification_per_user on public.atlantic_verification_requests(user_id) where status='pending';
alter table public.atlantic_verification_requests enable row level security;
drop policy if exists "Users view own verification requests" on public.atlantic_verification_requests;
create policy "Users view own verification requests" on public.atlantic_verification_requests for select to authenticated using (user_id=auth.uid() or public.is_atlantic_admin(auth.uid()));
drop policy if exists "Users submit own verification request" on public.atlantic_verification_requests;
create policy "Users submit own verification request" on public.atlantic_verification_requests for insert to authenticated with check (user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "Admins review verification requests" on public.atlantic_verification_requests;
create policy "Admins review verification requests" on public.atlantic_verification_requests for update to authenticated using (public.is_atlantic_admin(auth.uid())) with check (public.is_atlantic_admin(auth.uid()));
grant select,insert,update on public.atlantic_verification_requests to authenticated;
create or replace function public.review_atlantic_verification_request(request_id uuid, approve boolean, admin_note text default '')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target_user uuid;
begin
  if auth.uid() is null or not public.is_atlantic_admin(auth.uid()) then raise exception 'Hanya admin Atlantic yang dapat meninjau pengajuan.'; end if;
  select user_id into target_user from public.atlantic_verification_requests where id=request_id and status='pending' for update;
  if target_user is null then raise exception 'Pengajuan tidak ditemukan atau sudah ditinjau.'; end if;
  update public.atlantic_verification_requests set status=case when approve then 'approved' else 'rejected' end, reviewed_at=now(), reviewed_by=auth.uid(), review_note=left(coalesce(admin_note,''),500) where id=request_id;
  update public.profiles set is_verified=approve where id=target_user;
  return true;
end; $$;
revoke all on function public.review_atlantic_verification_request(uuid,boolean,text) from public;
grant execute on function public.review_atlantic_verification_request(uuid,boolean,text) to authenticated;

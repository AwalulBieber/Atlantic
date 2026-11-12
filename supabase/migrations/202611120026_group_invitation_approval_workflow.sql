create table if not exists public.atlantic_group_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint atlantic_group_invitation_distinct_users check (inviter_id <> invitee_id)
);
create unique index if not exists atlantic_group_invitation_pending_unique
  on public.atlantic_group_invitations(conversation_id,invitee_id) where status='pending';
create index if not exists atlantic_group_invitation_inbox_idx
  on public.atlantic_group_invitations(invitee_id,status,created_at desc);

alter table public.atlantic_group_invitations enable row level security;
grant select,insert,update on public.atlantic_group_invitations to authenticated;
revoke delete on public.atlantic_group_invitations from authenticated;

drop policy if exists "Atlantic group invitations visible to parties" on public.atlantic_group_invitations;
create policy "Atlantic group invitations visible to parties"
on public.atlantic_group_invitations for select to authenticated
using (inviter_id=(select auth.uid()) or invitee_id=(select auth.uid()));

drop policy if exists "Group admins create invitations" on public.atlantic_group_invitations;
create policy "Group admins create invitations"
on public.atlantic_group_invitations for insert to authenticated
with check (
  inviter_id=(select auth.uid())
  and status='pending'
  and public.is_conversation_admin(conversation_id)
);

drop policy if exists "Invitees respond to pending invitations" on public.atlantic_group_invitations;
create policy "Invitees respond to pending invitations"
on public.atlantic_group_invitations for update to authenticated
using (invitee_id=(select auth.uid()) and status='pending')
with check (invitee_id=(select auth.uid()) and status in ('accepted','rejected'));

drop policy if exists "Invitees join after accepting group invitation" on public.conversation_members;
create policy "Invitees join after accepting group invitation"
on public.conversation_members for insert to authenticated
with check (
  user_id=(select auth.uid())
  and role='member'
  and exists (
    select 1 from public.atlantic_group_invitations invitation
    where invitation.conversation_id=conversation_members.conversation_id
      and invitation.invitee_id=(select auth.uid())
      and invitation.status='accepted'
  )
);

create or replace function public.respond_atlantic_group_invitation(request_id uuid, decision text)
returns boolean
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
declare
  target_conversation uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if decision not in ('accepted','rejected') then raise exception 'Pilihan undangan tidak valid'; end if;
  update public.atlantic_group_invitations
    set status=decision,responded_at=now()
    where id=request_id and invitee_id=auth.uid() and status='pending'
    returning conversation_id into target_conversation;
  if target_conversation is null then raise exception 'Undangan tidak ditemukan atau sudah diproses'; end if;
  if decision='accepted' then
    insert into public.conversation_members(conversation_id,user_id,role)
    values(target_conversation,auth.uid(),'member')
    on conflict(conversation_id,user_id) do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.respond_atlantic_group_invitation(uuid,text) from public,anon;
grant execute on function public.respond_atlantic_group_invitation(uuid,text) to authenticated;

create or replace function public.create_group_conversation(group_title text, member_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path='public','pg_temp'
as $$
declare
  actor uuid := auth.uid();
  new_conversation uuid;
  valid_count integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(group_title,''))) < 2 or length(trim(group_title)) > 60 then
    raise exception 'Nama grup harus 2 sampai 60 karakter';
  end if;
  if member_ids is null then raise exception 'Pilih minimal dua anggota'; end if;
  select count(distinct uid) into valid_count
  from unnest(member_ids) as selected(uid)
  where uid is not null and uid <> actor;
  if valid_count < 2 then raise exception 'Pilih minimal dua anggota selain kamu'; end if;
  if valid_count > 99 then raise exception 'Maksimal 100 anggota termasuk pembuat grup'; end if;
  if exists (
    select 1 from (select distinct uid from unnest(member_ids) as selected(uid) where uid is not null and uid <> actor) chosen
    left join public.profiles p on p.id=chosen.uid
    where p.id is null or p.is_private=true
  ) then raise exception 'Ada anggota yang tidak valid atau profilnya privat'; end if;

  insert into public.conversations(title,is_group,created_by)
  values(trim(group_title),true,actor) returning id into new_conversation;

  insert into public.conversation_members(conversation_id,user_id,role)
  values(new_conversation,actor,'admin');

  insert into public.conversation_members(conversation_id,user_id,role)
  select new_conversation,p.id,'member'
  from public.profiles p
  join (select distinct uid from unnest(member_ids) as selected(uid) where uid is not null and uid <> actor) chosen on chosen.uid=p.id
  where coalesce(p.group_invite_policy,'everyone')='everyone'
  on conflict(conversation_id,user_id) do nothing;

  insert into public.atlantic_group_invitations(conversation_id,inviter_id,invitee_id,status)
  select new_conversation,actor,p.id,'pending'
  from public.profiles p
  join (select distinct uid from unnest(member_ids) as selected(uid) where uid is not null and uid <> actor) chosen on chosen.uid=p.id
  where p.group_invite_policy='approval';

  return new_conversation;
end;
$$;
revoke all on function public.create_group_conversation(text,uuid[]) from public,anon;
grant execute on function public.create_group_conversation(text,uuid[]) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atlantic_group_invitations') then
    alter publication supabase_realtime add table public.atlantic_group_invitations;
  end if;
end $$;
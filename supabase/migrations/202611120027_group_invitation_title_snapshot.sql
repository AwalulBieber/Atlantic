alter table public.atlantic_group_invitations
  add column if not exists group_title text;
update public.atlantic_group_invitations invitation
set group_title=coalesce(conversation.title,'Grup Atlantic')
from public.conversations conversation
where conversation.id=invitation.conversation_id and invitation.group_title is null;
alter table public.atlantic_group_invitations alter column group_title set default 'Grup Atlantic';
alter table public.atlantic_group_invitations alter column group_title set not null;

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

  insert into public.atlantic_group_invitations(conversation_id,inviter_id,invitee_id,status,group_title)
  select new_conversation,actor,p.id,'pending',trim(group_title)
  from public.profiles p
  join (select distinct uid from unnest(member_ids) as selected(uid) where uid is not null and uid <> actor) chosen on chosen.uid=p.id
  where p.group_invite_policy='approval';
  return new_conversation;
end;
$$;
revoke all on function public.create_group_conversation(text,uuid[]) from public,anon;
grant execute on function public.create_group_conversation(text,uuid[]) to authenticated;
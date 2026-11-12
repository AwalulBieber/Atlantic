create or replace function public.is_conversation_creator(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation and c.created_by = auth.uid()
  );
$$;
revoke all on function public.is_conversation_creator(uuid) from public, anon;
grant execute on function public.is_conversation_creator(uuid) to authenticated;

drop policy if exists "Creators add members" on public.conversation_members;
create policy "Creators add members" on public.conversation_members
for insert to authenticated
with check (public.is_conversation_creator(conversation_id));

create or replace function public.create_group_conversation(group_title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  new_conversation uuid;
  valid_count integer;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(group_title, ''))) < 2 or length(trim(group_title)) > 60 then
    raise exception 'Nama grup harus 2 sampai 60 karakter';
  end if;
  if member_ids is null then
    raise exception 'Pilih minimal dua anggota';
  end if;
  select count(distinct uid) into valid_count
  from unnest(member_ids) as selected(uid)
  where uid is not null and uid <> actor;
  if valid_count < 2 then
    raise exception 'Pilih minimal dua anggota selain kamu';
  end if;
  if valid_count > 99 then
    raise exception 'Maksimal 100 anggota termasuk pembuat grup';
  end if;
  if exists (
    select 1
    from (select distinct uid from unnest(member_ids) as selected(uid) where uid is not null and uid <> actor) chosen
    left join public.profiles p on p.id = chosen.uid
    where p.id is null
  ) then
    raise exception 'Ada anggota yang tidak valid';
  end if;
  insert into public.conversations (title, is_group, created_by)
  values (trim(group_title), true, actor)
  returning id into new_conversation;
  insert into public.conversation_members (conversation_id, user_id)
  select new_conversation, actor
  union
  select new_conversation, uid
  from unnest(member_ids) as selected(uid)
  where uid is not null and uid <> actor;
  return new_conversation;
end;
$$;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

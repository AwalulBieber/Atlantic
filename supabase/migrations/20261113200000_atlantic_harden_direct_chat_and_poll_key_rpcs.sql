create or replace function public.create_direct_conversation(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  current_user_id uuid := (select auth.uid());
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;

  if target_user is null or target_user = current_user_id then
    raise exception 'Pengguna tujuan tidak valid.';
  end if;

  if public.is_atlantic_user_blocked() then
    raise exception 'Akun ini sedang dibatasi dan tidak dapat memulai chat.';
  end if;

  if public.is_atlantic_user_pair_blocked(current_user_id, target_user) then
    raise exception 'Chat tidak dapat dibuat karena salah satu akun memblokir akun lainnya.';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'Pengguna tidak ditemukan.';
  end if;

  select c.id into conversation_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id
  join public.conversation_members b on b.conversation_id = c.id
  where c.is_group = false
    and a.user_id = current_user_id
    and b.user_id = target_user
  limit 1;

  if conversation_id is not null then
    return conversation_id;
  end if;

  insert into public.conversations (created_by, is_group)
  values (current_user_id, false)
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, current_user_id), (conversation_id, target_user);

  return conversation_id;
end;
$function$;

create or replace function public.set_atlantic_poll_e2ee_key(p_poll_id uuid, p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  v_target uuid;
  v_type text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select target_id, target_type into v_target, v_type
  from public.atlantic_polls
  where id = p_poll_id and created_by = (select auth.uid());

  if not found or v_type <> 'group'
     or not public.is_conversation_member(v_target) then
    raise exception 'Only the poll creator in the group can set its E2EE key';
  end if;

  if p_key_id is null or not exists (
    select 1 from public.conversation_e2ee_keys k
    where k.conversation_id = v_target and k.key_id = p_key_id
  ) then
    raise exception 'E2EE key must belong to the poll conversation';
  end if;

  update public.atlantic_polls set e2ee_key_id = p_key_id where id = p_poll_id;
  return true;
end;
$function$;

create or replace function public.revoke_atlantic_invite_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  update public.atlantic_invite_links
     set revoked_at = now()
   where id = p_link_id
     and created_by = (select auth.uid())
     and revoked_at is null;
  if not found then
    raise exception 'Invite link not found or access denied';
  end if;
end;
$function$;

revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
revoke all on function public.set_atlantic_poll_e2ee_key(uuid, uuid) from public, anon;
grant execute on function public.set_atlantic_poll_e2ee_key(uuid, uuid) to authenticated;
revoke all on function public.revoke_atlantic_invite_link(uuid) from public, anon;
grant execute on function public.revoke_atlantic_invite_link(uuid) to authenticated;

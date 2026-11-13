create or replace function public.rotate_atlantic_conversation_e2ee_key(
  p_conversation_id uuid,
  p_expected_key_id uuid,
  p_next_key_id uuid,
  p_next_shares jsonb,
  p_member_ids uuid[]
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_current public.conversation_e2ee_keys%rowtype;
begin
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation membership required';
  end if;
  if p_next_key_id is null or p_next_shares is null or jsonb_typeof(p_next_shares) <> 'object' then
    raise exception 'Invalid E2EE key envelope';
  end if;
  select * into v_current
  from public.conversation_e2ee_keys
  where conversation_id = p_conversation_id
  for update;
  if not found or v_current.key_id <> p_expected_key_id then
    return false;
  end if;
  insert into public.conversation_e2ee_key_epochs(
    conversation_id,key_id,shares,member_ids,created_by
  ) values (
    p_conversation_id,v_current.key_id,v_current.shares,
    coalesce(v_current.member_ids,'{}'::uuid[]),(select auth.uid())
  ) on conflict (conversation_id,key_id) do nothing;

  update public.messages
  set e2ee_key_id = v_current.key_id
  where conversation_id = p_conversation_id
    and e2ee_key_id is null
    and body like 'ATL-E2EE1:%';

  update public.atlantic_polls
  set e2ee_key_id = v_current.key_id
  where target_type = 'group'
    and target_id = p_conversation_id
    and e2ee_key_id is null
    and question like 'ATL-E2EE1:%';

  update public.conversation_e2ee_keys
  set key_id = p_next_key_id,
      shares = p_next_shares,
      member_ids = coalesce(p_member_ids,'{}'::uuid[]),
      updated_at = now()
  where conversation_id = p_conversation_id
    and key_id = p_expected_key_id;
  return true;
end;
$function$;
revoke all on function public.rotate_atlantic_conversation_e2ee_key(uuid,uuid,uuid,jsonb,uuid[]) from public, anon;
grant execute on function public.rotate_atlantic_conversation_e2ee_key(uuid,uuid,uuid,jsonb,uuid[]) to authenticated;

create or replace function public.set_atlantic_poll_e2ee_key(p_poll_id uuid,p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_target uuid; v_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select target_id,target_type into v_target,v_type
  from public.atlantic_polls
  where id=p_poll_id and created_by=(select auth.uid());
  if not found or v_type <> 'group' or not public.is_conversation_member(v_target) then
    raise exception 'Only the poll creator in the group can set its E2EE key';
  end if;
  update public.atlantic_polls set e2ee_key_id=p_key_id where id=p_poll_id;
  return true;
end;
$function$;
revoke all on function public.set_atlantic_poll_e2ee_key(uuid,uuid) from public, anon;
grant execute on function public.set_atlantic_poll_e2ee_key(uuid,uuid) to authenticated;
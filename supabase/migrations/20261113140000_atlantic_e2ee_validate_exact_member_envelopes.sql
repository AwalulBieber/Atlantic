create or replace function public.validate_conversation_e2ee_envelopes()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare v_member_ids uuid[];
begin
  select coalesce(array_agg(cm.user_id order by cm.user_id), '{}'::uuid[])
  into v_member_ids
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id;

  if cardinality(coalesce(new.member_ids, '{}'::uuid[])) <> cardinality(v_member_ids)
     or exists (
       select 1 from unnest(v_member_ids) as current_member(user_id)
       where not (current_member.user_id = any(coalesce(new.member_ids, '{}'::uuid[])))
     ) then
    raise exception 'E2EE envelope recipients must exactly match current conversation members';
  end if;

  if jsonb_typeof(new.shares) <> 'object'
     or (select count(*) from jsonb_object_keys(new.shares)) <> cardinality(v_member_ids)
     or exists (
       select 1 from jsonb_object_keys(new.shares) as envelope(recipient_id)
       where not exists (
         select 1 from unnest(v_member_ids) as current_member(user_id)
         where current_member.user_id::text = envelope.recipient_id
       )
     ) then
    raise exception 'E2EE key shares must exactly match current conversation members';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_conversation_e2ee_envelopes on public.conversation_e2ee_keys;
create trigger validate_conversation_e2ee_envelopes
before insert or update of member_ids, shares on public.conversation_e2ee_keys
for each row execute function public.validate_conversation_e2ee_envelopes();

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
    and left(body,10) = 'ATL-E2EE1:';

  update public.atlantic_polls
  set e2ee_key_id = v_current.key_id
  where target_type = 'group'
    and target_id = p_conversation_id
    and e2ee_key_id is null
    and left(question,10) = 'ATL-E2EE1:';

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
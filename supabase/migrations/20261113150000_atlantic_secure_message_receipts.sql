-- Restrict message receipt writes to a narrowly scoped, membership-checked RPC.
drop policy if exists "Atlantic recipients can update message receipts" on public.messages;

create or replace function public.record_atlantic_message_receipts(
  p_conversation_ids uuid[] default null,
  p_message_ids uuid[] default null,
  p_mark_read boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(cardinality(p_conversation_ids), 0) = 0
     and coalesce(cardinality(p_message_ids), 0) = 0 then
    raise exception 'A conversation or message list is required';
  end if;

  if p_conversation_ids is not null and exists (
    select 1
    from unnest(p_conversation_ids) as requested(conversation_id)
    where not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = requested.conversation_id
        and cm.user_id = v_user_id
    )
  ) then
    raise exception 'Conversation access denied';
  end if;

  if p_message_ids is not null and exists (
    select 1
    from unnest(p_message_ids) as requested(message_id)
    left join public.messages m on m.id = requested.message_id
    where m.id is null
       or m.sender_id = v_user_id
       or not exists (
         select 1 from public.conversation_members cm
         where cm.conversation_id = m.conversation_id
           and cm.user_id = v_user_id
       )
  ) then
    raise exception 'Message access denied';
  end if;

  update public.messages m
     set delivered_at = coalesce(m.delivered_at, now()),
         read_at = case
           when p_mark_read then coalesce(m.read_at, now())
           else m.read_at
         end
   where m.sender_id <> v_user_id
     and m.deleted_for_everyone_at is null
     and (p_conversation_ids is null or m.conversation_id = any(p_conversation_ids))
     and (p_message_ids is null or m.id = any(p_message_ids))
     and exists (
       select 1 from public.conversation_members cm
       where cm.conversation_id = m.conversation_id
         and cm.user_id = v_user_id
     );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

revoke all on function public.record_atlantic_message_receipts(uuid[], uuid[], boolean) from public, anon;
grant execute on function public.record_atlantic_message_receipts(uuid[], uuid[], boolean) to authenticated;

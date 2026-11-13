create or replace function public.get_or_create_saved_messages_conversation()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select id into v_conversation_id
  from public.conversations
  where created_by = v_user_id and is_saved_chat = true
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (created_by, is_group, title, description, is_saved_chat)
    values (v_user_id, false, 'Pesan Tersimpan', 'Cloud pribadi untuk menyimpan pesan dan catatan.', true)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'owner')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$function$;
revoke all on function public.get_or_create_saved_messages_conversation() from public, anon;
grant execute on function public.get_or_create_saved_messages_conversation() to authenticated;

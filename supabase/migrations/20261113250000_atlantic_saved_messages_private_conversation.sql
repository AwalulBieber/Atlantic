alter table public.conversations
  add column if not exists is_saved_chat boolean not null default false;

create unique index if not exists conversations_one_saved_chat_per_user
  on public.conversations (created_by)
  where is_saved_chat = true;

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
  values (v_conversation_id, v_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$function$;

revoke all on function public.get_or_create_saved_messages_conversation() from public, anon;
grant execute on function public.get_or_create_saved_messages_conversation() to authenticated;

create or replace function public.hide_atlantic_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  is_saved boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select coalesce(c.is_saved_chat, false) into is_saved
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = actor
  where c.id = p_conversation_id;
  if not found then raise exception 'Percakapan tidak ditemukan'; end if;
  if is_saved then raise exception 'Pesan Tersimpan tidak bisa dihapus'; end if;

  delete from public.archived_conversations
  where conversation_id = p_conversation_id and user_id = actor;
  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = actor;
  return true;
end;
$$;

revoke all on function public.hide_atlantic_conversation(uuid) from public, anon;
grant execute on function public.hide_atlantic_conversation(uuid) to authenticated;

create or replace function public.delete_atlantic_conversation_for_everyone(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  conversation_creator uuid;
  is_saved boolean;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  select c.created_by, coalesce(c.is_saved_chat, false)
    into conversation_creator, is_saved
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id = actor
  where c.id = p_conversation_id;

  if not found then
    raise exception 'Percakapan tidak ditemukan atau kamu bukan anggotanya';
  end if;
  if is_saved then
    raise exception 'Pesan Tersimpan tidak bisa dihapus';
  end if;
  if conversation_creator is distinct from actor then
    raise exception 'Hanya pembuat percakapan yang dapat menghapusnya untuk semua orang';
  end if;

  delete from public.conversations where id = p_conversation_id;
  return true;
end;
$$;

revoke all on function public.delete_atlantic_conversation_for_everyone(uuid) from public, anon;
grant execute on function public.delete_atlantic_conversation_for_everyone(uuid) to authenticated;

create or replace function public.respond_atlantic_group_invitation(request_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  target_conversation uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if decision not in ('accepted','rejected') then raise exception 'Pilihan undangan tidak valid'; end if;
  update public.atlantic_group_invitations
    set status=decision,responded_at=now()
    where id=request_id and invitee_id=actor and status='pending'
    returning conversation_id into target_conversation;
  if target_conversation is null then raise exception 'Undangan tidak ditemukan atau sudah diproses'; end if;
  if decision='accepted' then
    insert into public.conversation_members(conversation_id,user_id,role)
    values(target_conversation,actor,'member')
    on conflict(conversation_id,user_id) do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.respond_atlantic_group_invitation(uuid,text) from public,anon;
grant execute on function public.respond_atlantic_group_invitation(uuid,text) to authenticated;
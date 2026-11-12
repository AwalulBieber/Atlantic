create or replace function public.create_atlantic_invite_link(
  p_invite_type text, p_resource_id uuid, p_token text,
  p_expires_at timestamptz default null, p_max_uses integer default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_invite_type not in ('group','channel') then raise exception 'Invalid invite type'; end if;
  if p_token is null or length(p_token)<32 or length(p_token)>100 then raise exception 'Invalid invite token'; end if;
  if p_max_uses is not null and p_max_uses<1 then raise exception 'Invalid usage limit'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
  if p_invite_type='group' then
    if not exists(select 1 from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id where cm.conversation_id=p_resource_id and cm.user_id=auth.uid() and cm.role='admin' and c.is_group=true) then
      raise exception 'Only group admins can create invite links';
    end if;
  else
    if not exists(select 1 from public.atlantic_channels c where c.id=p_resource_id and c.owner_id=auth.uid()) then
      raise exception 'Only channel owners can create invite links';
    end if;
  end if;
  update public.atlantic_invite_links set revoked_at=now()
  where invite_type=p_invite_type and resource_id=p_resource_id and revoked_at is null;
  insert into public.atlantic_invite_links(token,invite_type,resource_id,created_by,expires_at,max_uses)
  values(p_token,p_invite_type,p_resource_id,auth.uid(),p_expires_at,p_max_uses)
  returning id into new_id;
  return new_id;
end;
$$;

create table if not exists public.atlantic_invite_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  invite_type text not null check (invite_type in ('group','channel')),
  resource_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz
);
create index if not exists atlantic_invite_links_resource_idx on public.atlantic_invite_links(invite_type,resource_id);
alter table public.atlantic_invite_links enable row level security;
revoke all on public.atlantic_invite_links from anon, authenticated;

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
  insert into public.atlantic_invite_links(token,invite_type,resource_id,created_by,expires_at,max_uses)
  values(p_token,p_invite_type,p_resource_id,auth.uid(),p_expires_at,p_max_uses)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.get_atlantic_invite_preview(p_token text)
returns table(invite_type text,resource_id uuid,title text,description text,avatar_url text,created_by uuid)
language plpgsql security definer set search_path=public
as $$
begin
  return query
  select l.invite_type,l.resource_id,
    case when l.invite_type='group' then coalesce(c.title,'Grup Atlantic') else ch.name end,
    case when l.invite_type='group' then coalesce(c.description,'') else ch.description end,
    case when l.invite_type='group' then c.avatar_url else ch.avatar_url end,
    l.created_by
  from public.atlantic_invite_links l
  left join public.conversations c on l.invite_type='group' and c.id=l.resource_id
  left join public.atlantic_channels ch on l.invite_type='channel' and ch.id=l.resource_id
  where l.token=p_token and l.revoked_at is null
    and (l.expires_at is null or l.expires_at>now())
    and (l.max_uses is null or l.use_count<l.max_uses)
  limit 1;
end;
$$;

create or replace function public.accept_atlantic_invite(p_token text)
returns table(invite_type text,resource_id uuid,title text)
language plpgsql security definer set search_path=public
as $$
declare
  l public.atlantic_invite_links%rowtype;
  result_title text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into l from public.atlantic_invite_links where token=p_token for update;
  if not found or l.revoked_at is not null or (l.expires_at is not null and l.expires_at<=now()) or (l.max_uses is not null and l.use_count>=l.max_uses) then
    raise exception 'Invite link is invalid, expired, or full';
  end if;
  if l.invite_type='group' then
    select coalesce(c.title,'Grup Atlantic') into result_title from public.conversations c where c.id=l.resource_id and c.is_group=true;
    if result_title is null then raise exception 'Group no longer exists'; end if;
    if not exists(select 1 from public.conversation_members where conversation_id=l.resource_id and user_id=auth.uid()) then
      insert into public.conversation_members(conversation_id,user_id,role) values(l.resource_id,auth.uid(),'member');
    end if;
  else
    select ch.name into result_title from public.atlantic_channels ch where ch.id=l.resource_id;
    if result_title is null then raise exception 'Channel no longer exists'; end if;
    insert into public.atlantic_channel_members(channel_id,user_id,role)
    values(l.resource_id,auth.uid(),'member') on conflict(channel_id,user_id) do nothing;
  end if;
  update public.atlantic_invite_links set use_count=use_count+1 where id=l.id;
  return query select l.invite_type,l.resource_id,result_title;
end;
$$;

create or replace function public.revoke_atlantic_invite_link(p_link_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  update public.atlantic_invite_links set revoked_at=now()
  where id=p_link_id and created_by=auth.uid() and revoked_at is null;
  if not found then raise exception 'Invite link not found or access denied'; end if;
end;
$$;

revoke all on function public.create_atlantic_invite_link(text,uuid,text,timestamptz,integer) from public,anon;
revoke all on function public.get_atlantic_invite_preview(text) from public,anon;
revoke all on function public.accept_atlantic_invite(text) from public,anon;
revoke all on function public.revoke_atlantic_invite_link(uuid) from public,anon;
grant execute on function public.create_atlantic_invite_link(text,uuid,text,timestamptz,integer) to authenticated;
grant execute on function public.get_atlantic_invite_preview(text) to authenticated;
grant execute on function public.accept_atlantic_invite(text) to authenticated;
grant execute on function public.revoke_atlantic_invite_link(uuid) to authenticated;

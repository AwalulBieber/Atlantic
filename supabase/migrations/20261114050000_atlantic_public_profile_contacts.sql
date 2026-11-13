alter table public.profiles
  add column if not exists show_contacts boolean not null default false;

create or replace function public.get_public_profile_contacts(target_user uuid)
returns table(id uuid, username text, display_name text, avatar_url text, is_verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified
  from public.profiles owner
  join public.atlantic_contacts c
    on c.status = 'accepted'
   and (c.requester_id = owner.id or c.addressee_id = owner.id)
  join public.profiles p
    on p.id = case when c.requester_id = owner.id then c.addressee_id else c.requester_id end
  where owner.id = target_user
    and owner.is_private is not true
    and owner.show_contacts is true
    and auth.uid() is not null
    and not public.is_atlantic_user_pair_blocked(auth.uid(), target_user)
    and not public.is_atlantic_user_pair_blocked(auth.uid(), p.id)
  order by lower(coalesce(p.display_name, p.username));
$$;

revoke all on function public.get_public_profile_contacts(uuid) from public, anon;
grant execute on function public.get_public_profile_contacts(uuid) to authenticated;

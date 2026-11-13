-- Keep moderation state out of the broadly readable profiles surface.
revoke select (is_blocked, blocked_reason), insert (is_blocked, blocked_reason)
  on table public.profiles from authenticated;

create or replace function public.get_my_profile_moderation_state()
returns table(is_blocked boolean, blocked_reason text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select coalesce(p.is_blocked, false), p.blocked_reason
  from public.profiles p
  where p.id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;

create or replace function public.admin_get_profile_moderation(p_user_ids uuid[])
returns table(user_id uuid, is_blocked boolean, blocked_reason text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if (select auth.uid()) is null
     or not public.is_atlantic_admin((select auth.uid())) then
    raise exception 'Atlantic admin access required';
  end if;
  if coalesce(cardinality(p_user_ids), 0) > 100 then
    raise exception 'Maximum 100 profiles per request';
  end if;
  return query
    select p.id, coalesce(p.is_blocked, false), p.blocked_reason
    from public.profiles p
    where p.id = any(coalesce(p_user_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.get_my_profile_moderation_state() from public, anon;
revoke all on function public.admin_get_profile_moderation(uuid[]) from public, anon;
grant execute on function public.get_my_profile_moderation_state() to authenticated;
grant execute on function public.admin_get_profile_moderation(uuid[]) to authenticated;

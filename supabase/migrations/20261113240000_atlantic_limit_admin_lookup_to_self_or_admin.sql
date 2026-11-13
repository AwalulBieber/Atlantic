create or replace function public.is_atlantic_admin(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
  select case
    when (select auth.uid()) is null then false
    when target_user = (select auth.uid()) then exists (
      select 1 from public.atlantic_admins a where a.user_id = target_user
    )
    when exists (
      select 1 from public.atlantic_admins caller_admin
      where caller_admin.user_id = (select auth.uid())
    ) then exists (
      select 1 from public.atlantic_admins target_admin
      where target_admin.user_id = target_user
    )
    else false
  end;
$function$;

revoke all on function public.is_atlantic_admin(uuid) from public, anon;
grant execute on function public.is_atlantic_admin(uuid) to authenticated;

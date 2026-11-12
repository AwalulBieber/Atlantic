create or replace function public.is_conversation_admin(cid uuid)
returns boolean
language sql
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=cid
      and cm.user_id=auth.uid()
      and cm.role='admin'
  );
$$;
revoke all on function public.is_conversation_admin(uuid) from public,anon;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

drop policy if exists "Group members add members by group policy" on public.conversation_members;
create policy "Group members add members by group policy"
on public.conversation_members for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id=conversation_members.conversation_id
      and c.is_group=true
      and (
        (c.created_by=(select auth.uid()) and conversation_members.user_id=(select auth.uid()) and conversation_members.role='admin')
        or (
          public.is_conversation_admin(c.id)
          and conversation_members.role='member'
        )
        or (
          c.add_member_policy='all'
          and public.is_conversation_member(c.id)
          and conversation_members.role='member'
        )
      )
  )
);
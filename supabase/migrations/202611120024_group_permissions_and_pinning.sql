alter table public.conversations
  add column if not exists message_policy text not null default 'all'
    check (message_policy in ('all','admins')),
  add column if not exists add_member_policy text not null default 'admins'
    check (add_member_policy in ('all','admins')),
  add column if not exists pinned_message_id uuid references public.messages(id) on delete set null;

grant update (message_policy,add_member_policy,pinned_message_id) on public.conversations to authenticated;

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
  and (
    not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.is_group = true
        and c.message_policy = 'admins'
    )
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = (select auth.uid())
        and cm.role = 'admin'
    )
  )
);

drop policy if exists "Group creators add members safely" on public.conversation_members;
create policy "Group members add members by group policy"
on public.conversation_members for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.is_group = true
      and (
        (c.created_by = (select auth.uid()) and conversation_members.user_id = (select auth.uid()) and conversation_members.role = 'admin')
        or (
          exists (
            select 1 from public.conversation_members actor
            where actor.conversation_id = c.id
              and actor.user_id = (select auth.uid())
              and actor.role = 'admin'
          )
          and conversation_members.role = 'member'
        )
        or (
          c.add_member_policy = 'all'
          and exists (
            select 1 from public.conversation_members actor
            where actor.conversation_id = c.id
              and actor.user_id = (select auth.uid())
          )
          and conversation_members.role = 'member'
        )
      )
  )
);
create table if not exists public.atlantic_message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.atlantic_message_reads enable row level security;
revoke all on table public.atlantic_message_reads from anon, authenticated;
grant select, insert on table public.atlantic_message_reads to authenticated;

create index if not exists atlantic_message_reads_user_message_idx
  on public.atlantic_message_reads (user_id, message_id);
create index if not exists messages_conversation_created_desc_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists message_user_states_user_message_deleted_idx
  on public.message_user_states (user_id, message_id, is_deleted);

create policy "Users read their own message read states"
  on public.atlantic_message_reads for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users mark messages read in their conversations"
  on public.atlantic_message_reads for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_id
        and cm.user_id = (select auth.uid())
        and m.sender_id <> (select auth.uid())
    )
  );

create or replace function public.mark_atlantic_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
  ) then
    raise exception 'Conversation access denied';
  end if;

  insert into public.atlantic_message_reads (message_id, user_id)
  select m.id, (select auth.uid())
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> (select auth.uid())
    and m.deleted_for_everyone_at is null
  on conflict (message_id, user_id) do nothing;
end;
$$;

revoke all on function public.mark_atlantic_conversation_read(uuid) from public, anon;
grant execute on function public.mark_atlantic_conversation_read(uuid) to authenticated;

create or replace function public.get_atlantic_unread_summaries()
returns table (
  conversation_id uuid,
  unread_count bigint,
  latest_body text,
  latest_media_type text,
  latest_created_at timestamptz,
  latest_sender_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  with member_conversations as (
    select cm.conversation_id
    from public.conversation_members cm
    where cm.user_id = (select auth.uid())
  ),
  unread as (
    select m.conversation_id, count(*)::bigint as unread_count
    from public.messages m
    join member_conversations mc on mc.conversation_id = m.conversation_id
    where m.sender_id <> (select auth.uid())
      and m.deleted_for_everyone_at is null
      and not exists (
        select 1 from public.atlantic_message_reads r
        where r.message_id = m.id and r.user_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.message_user_states s
        where s.message_id = m.id and s.user_id = (select auth.uid()) and s.is_deleted = true
      )
    group by m.conversation_id
  ),
  latest as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.body, m.media_type, m.created_at, m.sender_id
    from public.messages m
    join member_conversations mc on mc.conversation_id = m.conversation_id
    where m.deleted_for_everyone_at is null
      and not exists (
        select 1 from public.message_user_states s
        where s.message_id = m.id and s.user_id = (select auth.uid()) and s.is_deleted = true
      )
    order by m.conversation_id, m.created_at desc
  )
  select u.conversation_id, u.unread_count, l.body, l.media_type, l.created_at, l.sender_id
  from unread u
  left join latest l on l.conversation_id = u.conversation_id
  order by l.created_at desc nulls last;
$$;

revoke all on function public.get_atlantic_unread_summaries() from public, anon;
grant execute on function public.get_atlantic_unread_summaries() to authenticated;

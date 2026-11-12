-- Atlantic group and channel polls with visible voter identities.
create table if not exists public.atlantic_polls (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('group','channel')),
  target_id uuid not null,
  question text not null check (char_length(trim(question)) between 3 and 240),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  closed_at timestamptz
);
create table if not exists public.atlantic_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.atlantic_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  position integer not null default 0,
  unique(poll_id,position), unique(poll_id,label)
);
create table if not exists public.atlantic_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.atlantic_polls(id) on delete cascade,
  option_id uuid not null references public.atlantic_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(poll_id,user_id)
);
create index if not exists atlantic_polls_target_idx on public.atlantic_polls(target_type,target_id,created_at desc);
create index if not exists atlantic_poll_options_poll_idx on public.atlantic_poll_options(poll_id,position);
create index if not exists atlantic_poll_votes_poll_idx on public.atlantic_poll_votes(poll_id,option_id);
alter table public.atlantic_polls enable row level security;
alter table public.atlantic_poll_options enable row level security;
alter table public.atlantic_poll_votes enable row level security;
revoke all on public.atlantic_polls,public.atlantic_poll_options,public.atlantic_poll_votes from anon,authenticated;
grant select on public.atlantic_polls,public.atlantic_poll_options,public.atlantic_poll_votes to authenticated;
create or replace function public.atlantic_can_view_poll(p_type text,p_target uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select case when p_type='group' then public.is_conversation_member(p_target)
 when p_type='channel' then exists(select 1 from public.atlantic_channel_members m where m.channel_id=p_target and m.user_id=(select auth.uid()))
 else false end;
$$;
revoke all on function public.atlantic_can_view_poll(text,uuid) from public,anon;
grant execute on function public.atlantic_can_view_poll(text,uuid) to authenticated;
create policy "Atlantic poll members read" on public.atlantic_polls for select to authenticated using (public.atlantic_can_view_poll(target_type,target_id));
create policy "Atlantic poll options members read" on public.atlantic_poll_options for select to authenticated using (exists(select 1 from public.atlantic_polls p where p.id=poll_id and public.atlantic_can_view_poll(p.target_type,p.target_id)));
create policy "Atlantic poll votes members read" on public.atlantic_poll_votes for select to authenticated using (exists(select 1 from public.atlantic_polls p where p.id=poll_id and public.atlantic_can_view_poll(p.target_type,p.target_id)));
create or replace function public.create_atlantic_poll(p_type text,p_target uuid,p_question text,p_options jsonb,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_option_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_type not in ('group','channel') then raise exception 'Invalid poll target'; end if;
 if p_question is null or char_length(trim(p_question)) not between 3 and 240 then raise exception 'Question must be 3–240 characters'; end if;
 if jsonb_typeof(p_options)<>'array' then raise exception 'Options must be a list'; end if;
 select count(*) into v_option_count from jsonb_array_elements_text(p_options) x where char_length(trim(x)) between 1 and 100;
 if v_option_count<2 or v_option_count>8 or v_option_count<>(select count(*) from jsonb_array_elements(p_options)) then raise exception 'Add 2–8 valid options'; end if;
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if p_type='group' then
   if not public.is_conversation_member(p_target) then raise exception 'Only group members can create polls'; end if;
   if not exists(select 1 from public.conversations c where c.id=p_target and c.is_group=true) then raise exception 'Group not found'; end if;
 else
   if not exists(select 1 from public.atlantic_channels c where c.id=p_target and c.owner_id=(select auth.uid())) then raise exception 'Only channel owners can create polls'; end if;
 end if;
 insert into public.atlantic_polls(target_type,target_id,question,created_by,expires_at) values(p_type,p_target,trim(p_question),(select auth.uid()),p_expires_at) returning id into v_id;
 insert into public.atlantic_poll_options(poll_id,label,position) select v_id,trim(value),ordinality::integer-1 from jsonb_array_elements_text(p_options) with ordinality;
 return v_id;
end;
$$;
create or replace function public.cast_atlantic_poll_vote(p_poll_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare p public.atlantic_polls%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into p from public.atlantic_polls where id=p_poll_id for update;
 if not found then raise exception 'Poll not found'; end if;
 if not public.atlantic_can_view_poll(p.target_type,p.target_id) then raise exception 'You cannot vote in this poll'; end if;
 if p.closed_at is not null or (p.expires_at is not null and p.expires_at<=now()) then raise exception 'Voting is closed'; end if;
 if not exists(select 1 from public.atlantic_poll_options where id=p_option_id and poll_id=p_poll_id) then raise exception 'Invalid option'; end if;
 insert into public.atlantic_poll_votes(poll_id,option_id,user_id) values(p_poll_id,p_option_id,(select auth.uid()))
 on conflict(poll_id,user_id) do update set option_id=excluded.option_id,created_at=now();
end;
$$;
create or replace function public.close_atlantic_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare p public.atlantic_polls%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into p from public.atlantic_polls where id=p_poll_id for update;
 if not found then raise exception 'Poll not found'; end if;
 if p.created_by<>(select auth.uid()) and not (
  (p.target_type='group' and exists(select 1 from public.conversation_members cm where cm.conversation_id=p.target_id and cm.user_id=(select auth.uid()) and cm.role='admin'))
  or (p.target_type='channel' and exists(select 1 from public.atlantic_channels c where c.id=p.target_id and c.owner_id=(select auth.uid())))
 ) then raise exception 'You cannot close this poll'; end if;
 update public.atlantic_polls set closed_at=now() where id=p_poll_id and closed_at is null;
end;
$$;
revoke all on function public.create_atlantic_poll(text,uuid,text,jsonb,timestamptz) from public,anon;
revoke all on function public.cast_atlantic_poll_vote(uuid,uuid) from public,anon;
revoke all on function public.close_atlantic_poll(uuid) from public,anon;
grant execute on function public.create_atlantic_poll(text,uuid,text,jsonb,timestamptz) to authenticated;
grant execute on function public.cast_atlantic_poll_vote(uuid,uuid) to authenticated;
grant execute on function public.close_atlantic_poll(uuid) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atlantic_poll_votes') then alter publication supabase_realtime add table public.atlantic_poll_votes; end if;
end $$;
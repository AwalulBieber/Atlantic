-- Atlantic community features. Additive migration: does not modify existing chat tables.
create extension if not exists pgcrypto;

create table if not exists public.atlantic_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  media_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists atlantic_stories_expiry_idx on public.atlantic_stories(expires_at desc);

create table if not exists public.atlantic_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists atlantic_notes_expiry_idx on public.atlantic_notes(expires_at desc);

create table if not exists public.atlantic_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 180),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.atlantic_channel_members (
  channel_id uuid not null references public.atlantic_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key(channel_id,user_id)
);

create table if not exists public.atlantic_channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.atlantic_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists atlantic_channel_posts_created_idx on public.atlantic_channel_posts(channel_id,created_at);

create table if not exists public.atlantic_call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'requested' check (status in ('requested','accepted','declined','missed','ended','cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint atlantic_call_not_self check (caller_id <> callee_id)
);
create index if not exists atlantic_calls_participants_idx on public.atlantic_call_sessions(caller_id,callee_id,started_at desc);

alter table public.atlantic_stories enable row level security;
alter table public.atlantic_notes enable row level security;
alter table public.atlantic_channels enable row level security;
alter table public.atlantic_channel_members enable row level security;
alter table public.atlantic_channel_posts enable row level security;
alter table public.atlantic_call_sessions enable row level security;

drop policy if exists "atlantic stories visible" on public.atlantic_stories;
create policy "atlantic stories visible" on public.atlantic_stories for select to authenticated using (expires_at > now());
drop policy if exists "atlantic stories insert own" on public.atlantic_stories;
create policy "atlantic stories insert own" on public.atlantic_stories for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "atlantic stories delete own" on public.atlantic_stories;
create policy "atlantic stories delete own" on public.atlantic_stories for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "atlantic notes visible" on public.atlantic_notes;
create policy "atlantic notes visible" on public.atlantic_notes for select to authenticated using (expires_at > now());
drop policy if exists "atlantic notes insert own" on public.atlantic_notes;
create policy "atlantic notes insert own" on public.atlantic_notes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "atlantic notes delete own" on public.atlantic_notes;
create policy "atlantic notes delete own" on public.atlantic_notes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "atlantic channels visible" on public.atlantic_channels;
create policy "atlantic channels visible" on public.atlantic_channels for select to authenticated using (is_public or owner_id = auth.uid());
drop policy if exists "atlantic channels create own" on public.atlantic_channels;
create policy "atlantic channels create own" on public.atlantic_channels for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "atlantic channels update owner" on public.atlantic_channels;
create policy "atlantic channels update owner" on public.atlantic_channels for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "atlantic channels delete owner" on public.atlantic_channels;
create policy "atlantic channels delete owner" on public.atlantic_channels for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "atlantic channel members visible" on public.atlantic_channel_members;
create policy "atlantic channel members visible" on public.atlantic_channel_members for select to authenticated using (user_id = auth.uid() or exists(select 1 from public.atlantic_channels c where c.id=channel_id and c.is_public));
drop policy if exists "atlantic channel members join self" on public.atlantic_channel_members;
create policy "atlantic channel members join self" on public.atlantic_channel_members for insert to authenticated with check (user_id = auth.uid() and role = 'member' and exists(select 1 from public.atlantic_channels c where c.id=channel_id and c.is_public));
drop policy if exists "atlantic channel members owner insert" on public.atlantic_channel_members;
create policy "atlantic channel members owner insert" on public.atlantic_channel_members for insert to authenticated with check (user_id = auth.uid() and role = 'owner' and exists(select 1 from public.atlantic_channels c where c.id=channel_id and c.owner_id=auth.uid()));
drop policy if exists "atlantic channel members leave self" on public.atlantic_channel_members;
create policy "atlantic channel members leave self" on public.atlantic_channel_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "atlantic channel posts visible to members" on public.atlantic_channel_posts;
create policy "atlantic channel posts visible to members" on public.atlantic_channel_posts for select to authenticated using (exists(select 1 from public.atlantic_channel_members m where m.channel_id=atlantic_channel_posts.channel_id and m.user_id=auth.uid()));
drop policy if exists "atlantic channel posts create as member" on public.atlantic_channel_posts;
create policy "atlantic channel posts create as member" on public.atlantic_channel_posts for insert to authenticated with check (author_id=auth.uid() and exists(select 1 from public.atlantic_channel_members m where m.channel_id=atlantic_channel_posts.channel_id and m.user_id=auth.uid()));

drop policy if exists "atlantic calls visible to participants" on public.atlantic_call_sessions;
create policy "atlantic calls visible to participants" on public.atlantic_call_sessions for select to authenticated using (caller_id=auth.uid() or callee_id=auth.uid());
drop policy if exists "atlantic calls requested by caller" on public.atlantic_call_sessions;
create policy "atlantic calls requested by caller" on public.atlantic_call_sessions for insert to authenticated with check (caller_id=auth.uid() and caller_id<>callee_id);
drop policy if exists "atlantic calls update by participants" on public.atlantic_call_sessions;
create policy "atlantic calls update by participants" on public.atlantic_call_sessions for update to authenticated using (caller_id=auth.uid() or callee_id=auth.uid()) with check (caller_id=auth.uid() or callee_id=auth.uid());

grant select,insert,delete on public.atlantic_stories to authenticated;
grant select,insert,delete on public.atlantic_notes to authenticated;
grant select,insert,update,delete on public.atlantic_channels to authenticated;
grant select,insert,delete on public.atlantic_channel_members to authenticated;
grant select,insert on public.atlantic_channel_posts to authenticated;
grant select,insert,update on public.atlantic_call_sessions to authenticated;

-- Add tables to Supabase Realtime for live updates where supported.
do $$ begin
  alter publication supabase_realtime add table public.atlantic_stories;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.atlantic_notes;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.atlantic_channel_posts;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Avatar uploads used by the existing profile editor.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Users can upload own avatars" on storage.objects;
create policy "Users can upload own avatars" on storage.objects
for insert to authenticated with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "Users can update own avatars" on storage.objects;
create policy "Users can update own avatars" on storage.objects
for update to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "Users can delete own avatars" on storage.objects;
create policy "Users can delete own avatars" on storage.objects
for delete to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

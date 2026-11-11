-- Atlantic Stories and Notes
-- Run once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_path text not null,
  media_type text not null,
  caption text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_active_created_idx on public.stories (expires_at desc, created_at desc);
alter table public.stories enable row level security;

drop policy if exists "Atlantic users can view active stories" on public.stories;
create policy "Atlantic users can view active stories" on public.stories
for select to authenticated using (expires_at > now());
drop policy if exists "Atlantic users can publish own stories" on public.stories;
create policy "Atlantic users can publish own stories" on public.stories
for insert to authenticated with check (user_id = auth.uid() and expires_at <= now() + interval '24 hours 5 minutes' and expires_at > now());
drop policy if exists "Atlantic users can delete own stories" on public.stories;
create policy "Atlantic users can delete own stories" on public.stories
for delete to authenticated using (user_id = auth.uid());

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;
drop policy if exists "Viewers can record own story views" on public.story_views;
create policy "Viewers can record own story views" on public.story_views
for insert to authenticated with check (viewer_id = auth.uid());
drop policy if exists "Users can see views on own stories" on public.story_views;
create policy "Users can see views on own stories" on public.story_views
for select to authenticated using (
  exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
);

create table if not exists public.user_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body varchar(60) not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
alter table public.user_notes enable row level security;
drop policy if exists "Atlantic users can view active notes" on public.user_notes;
create policy "Atlantic users can view active notes" on public.user_notes
for select to authenticated using (expires_at > now());
drop policy if exists "Users can insert own note" on public.user_notes;
create policy "Users can insert own note" on public.user_notes
for insert to authenticated with check (user_id = auth.uid() and length(trim(body)) between 1 and 60);
drop policy if exists "Users can update own note" on public.user_notes;
create policy "Users can update own note" on public.user_notes
for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and length(trim(body)) between 1 and 60);
drop policy if exists "Users can delete own note" on public.user_notes;
create policy "Users can delete own note" on public.user_notes
for delete to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atlantic-stories', 'atlantic-stories', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own story media" on storage.objects;
create policy "Users can upload own story media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'atlantic-stories' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users can read active story media" on storage.objects;
create policy "Users can read active story media" on storage.objects
for select to authenticated using (
  bucket_id = 'atlantic-stories' and exists (
    select 1 from public.stories s
    where s.media_path = name and s.expires_at > now()
  )
);
drop policy if exists "Users can delete own story media" on storage.objects;
create policy "Users can delete own story media" on storage.objects
for delete to authenticated using (
  bucket_id = 'atlantic-stories' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Expired rows can be cleaned periodically; visibility is already limited by RLS.

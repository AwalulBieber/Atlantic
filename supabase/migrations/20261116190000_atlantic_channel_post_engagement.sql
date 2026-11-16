-- Secure reactions and comments for channel posts.
create table if not exists public.atlantic_channel_post_reactions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.atlantic_channels(id) on delete cascade,
  post_id uuid not null references public.atlantic_channel_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default '👍' check (reaction in ('👍')),
  created_at timestamptz not null default now(),
  constraint atlantic_channel_post_reactions_unique unique(post_id,user_id,reaction)
);
create index if not exists atlantic_channel_post_reactions_post_idx
  on public.atlantic_channel_post_reactions(post_id,created_at);

create table if not exists public.atlantic_channel_post_comments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.atlantic_channels(id) on delete cascade,
  post_id uuid not null references public.atlantic_channel_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists atlantic_channel_post_comments_post_idx
  on public.atlantic_channel_post_comments(post_id,created_at);

alter table public.atlantic_channel_post_reactions enable row level security;
alter table public.atlantic_channel_post_comments enable row level security;

drop policy if exists "atlantic channel post reactions visible to members" on public.atlantic_channel_post_reactions;
create policy "atlantic channel post reactions visible to members"
on public.atlantic_channel_post_reactions for select to authenticated
using (exists (
  select 1 from public.atlantic_channel_members m
  where m.channel_id=atlantic_channel_post_reactions.channel_id and m.user_id=(select auth.uid())
));

drop policy if exists "atlantic channel post reactions insert own" on public.atlantic_channel_post_reactions;
create policy "atlantic channel post reactions insert own"
on public.atlantic_channel_post_reactions for insert to authenticated
with check (
  user_id=(select auth.uid())
  and reaction='👍'
  and exists (
    select 1 from public.atlantic_channel_members m
    where m.channel_id=atlantic_channel_post_reactions.channel_id and m.user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.atlantic_channel_posts p
    where p.id=atlantic_channel_post_reactions.post_id and p.channel_id=atlantic_channel_post_reactions.channel_id
  )
);

drop policy if exists "atlantic channel post reactions delete own" on public.atlantic_channel_post_reactions;
create policy "atlantic channel post reactions delete own"
on public.atlantic_channel_post_reactions for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists "atlantic channel post comments visible to members" on public.atlantic_channel_post_comments;
create policy "atlantic channel post comments visible to members"
on public.atlantic_channel_post_comments for select to authenticated
using (exists (
  select 1 from public.atlantic_channel_members m
  where m.channel_id=atlantic_channel_post_comments.channel_id and m.user_id=(select auth.uid())
));

drop policy if exists "atlantic channel post comments insert own" on public.atlantic_channel_post_comments;
create policy "atlantic channel post comments insert own"
on public.atlantic_channel_post_comments for insert to authenticated
with check (
  user_id=(select auth.uid())
  and char_length(body) between 1 and 1000
  and exists (
    select 1 from public.atlantic_channel_members m
    where m.channel_id=atlantic_channel_post_comments.channel_id and m.user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.atlantic_channel_posts p
    where p.id=atlantic_channel_post_comments.post_id and p.channel_id=atlantic_channel_post_comments.channel_id
  )
);

drop policy if exists "atlantic channel post comments delete own or staff" on public.atlantic_channel_post_comments;
create policy "atlantic channel post comments delete own or staff"
on public.atlantic_channel_post_comments for delete to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.atlantic_channel_members m
    where m.channel_id=atlantic_channel_post_comments.channel_id
      and m.user_id=(select auth.uid())
      and m.role in ('owner','admin')
  )
  or exists (
    select 1 from public.atlantic_channels c
    where c.id=atlantic_channel_post_comments.channel_id and c.owner_id=(select auth.uid())
  )
);

grant select,insert,delete on public.atlantic_channel_post_reactions to authenticated;
grant select,insert,delete on public.atlantic_channel_post_comments to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.atlantic_channel_post_reactions;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.atlantic_channel_post_comments;
exception when duplicate_object then null; when undefined_object then null; end $$;

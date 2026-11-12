drop policy if exists "atlantic channel posts delete own or owner" on public.atlantic_channel_posts;
create policy "atlantic channel posts delete own or owner"
on public.atlantic_channel_posts for delete to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.atlantic_channels c
    where c.id = atlantic_channel_posts.channel_id
      and c.owner_id = (select auth.uid())
  )
);
alter table public.conversations
  add column if not exists description text not null default '',
  add column if not exists avatar_url text,
  add column if not exists is_verified boolean not null default false;
alter table public.conversations
  drop constraint if exists conversations_description_check;
alter table public.conversations
  add constraint conversations_description_check check (char_length(description) <= 500);

alter table public.conversation_members
  add column if not exists role text not null default 'member';
update public.conversation_members cm
set role='admin'
from public.conversations c
where c.id=cm.conversation_id and c.is_group=true and c.created_by=cm.user_id;
alter table public.conversation_members
  drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check check (role in ('admin','member'));
create index if not exists conversation_members_user_role_idx on public.conversation_members(user_id,role);

drop policy if exists "Creators add members" on public.conversation_members;
create policy "Group creators add members safely"
  on public.conversation_members for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id=conversation_members.conversation_id
        and c.created_by=(select auth.uid())
        and (
          (conversation_members.user_id=(select auth.uid()) and conversation_members.role='admin')
          or conversation_members.role='member'
        )
    )
  );
drop policy if exists "Group admins update metadata" on public.conversations;
create policy "Group admins update metadata"
  on public.conversations for update to authenticated
  using (
    is_group=true and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=conversations.id
        and cm.user_id=(select auth.uid()) and cm.role='admin'
    )
  )
  with check (is_group=true);
revoke update on public.conversations from authenticated;
grant update (title,description,avatar_url) on public.conversations to authenticated;

create table if not exists public.atlantic_group_verification_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists atlantic_group_verification_pending_unique
  on public.atlantic_group_verification_requests(conversation_id) where status='pending';
create index if not exists atlantic_group_verification_status_idx
  on public.atlantic_group_verification_requests(status,created_at desc);
alter table public.atlantic_group_verification_requests enable row level security;
revoke all on public.atlantic_group_verification_requests from anon,authenticated;
grant select,insert on public.atlantic_group_verification_requests to authenticated;
create policy "Group members and Atlantic admins read group verification"
  on public.atlantic_group_verification_requests for select to authenticated
  using (
    public.is_atlantic_admin((select auth.uid()))
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=atlantic_group_verification_requests.conversation_id
        and cm.user_id=(select auth.uid())
    )
  );
create policy "Group admins submit verification"
  on public.atlantic_group_verification_requests for insert to authenticated
  with check (
    requester_id=(select auth.uid())
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=atlantic_group_verification_requests.conversation_id
        and cm.user_id=(select auth.uid()) and cm.role='admin'
    )
  );

create or replace function public.review_atlantic_group_verification_request(request_id uuid, approve boolean, admin_note text default '')
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  target_conversation uuid;
  changed integer;
begin
  if actor is null or not public.is_atlantic_admin(actor) then
    raise exception 'Atlantic admin access required';
  end if;
  update public.atlantic_group_verification_requests
     set status=case when approve then 'approved' else 'rejected' end,
         admin_note=left(coalesce(admin_note,''),500),
         reviewed_at=now(),reviewed_by=actor
   where id=request_id and status='pending'
   returning conversation_id into target_conversation;
  get diagnostics changed=row_count;
  if changed=0 then raise exception 'Permintaan verifikasi grup tidak ditemukan atau sudah diproses'; end if;
  update public.conversations set is_verified=approve where id=target_conversation and is_group=true;
  return true;
end;
$$;
revoke all on function public.review_atlantic_group_verification_request(uuid,boolean,text) from public,anon;
grant execute on function public.review_atlantic_group_verification_request(uuid,boolean,text) to authenticated;

alter table public.messages
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_name text;
alter table public.atlantic_channel_posts
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_name text;
alter table public.atlantic_channel_posts
  drop constraint if exists atlantic_channel_posts_body_check;
alter table public.atlantic_channel_posts
  add constraint atlantic_channel_posts_body_or_media_check
  check (((char_length(body) between 1 and 2000) or (media_url is not null and char_length(body)=0)));
alter table public.atlantic_channels
  add column if not exists avatar_url text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('atlantic-chat-media','atlantic-chat-media',false,52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=52428800,
  allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('atlantic-channel-media','atlantic-channel-media',false,52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=52428800,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Atlantic chat media members read" on storage.objects;
create policy "Atlantic chat media members read"
  on storage.objects for select to authenticated
  using (
    bucket_id='atlantic-chat-media'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text=(storage.foldername(name))[1]
        and cm.user_id=(select auth.uid())
    )
  );
drop policy if exists "Atlantic chat media members upload" on storage.objects;
create policy "Atlantic chat media members upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id='atlantic-chat-media'
    and (storage.foldername(name))[2]=(select auth.uid())::text
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text=(storage.foldername(name))[1]
        and cm.user_id=(select auth.uid())
    )
  );
drop policy if exists "Atlantic chat media owner delete" on storage.objects;
create policy "Atlantic chat media owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id='atlantic-chat-media' and (storage.foldername(name))[2]=(select auth.uid())::text);

drop policy if exists "Atlantic channel media members read" on storage.objects;
create policy "Atlantic channel media members read"
  on storage.objects for select to authenticated
  using (
    bucket_id='atlantic-channel-media'
    and exists (
      select 1 from public.atlantic_channel_members m
      where m.channel_id::text=(storage.foldername(name))[1]
        and m.user_id=(select auth.uid())
    )
  );
drop policy if exists "Atlantic channel media members upload" on storage.objects;
create policy "Atlantic channel media members upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id='atlantic-channel-media'
    and (storage.foldername(name))[2]=(select auth.uid())::text
    and exists (
      select 1 from public.atlantic_channel_members m
      where m.channel_id::text=(storage.foldername(name))[1]
        and m.user_id=(select auth.uid())
    )
  );
drop policy if exists "Atlantic channel media owner delete" on storage.objects;
create policy "Atlantic channel media owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id='atlantic-channel-media' and (storage.foldername(name))[2]=(select auth.uid())::text);

do $$
begin
  alter publication supabase_realtime add table public.atlantic_group_verification_requests;
exception when duplicate_object then null;
end $$;
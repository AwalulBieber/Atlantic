create table if not exists public.atlantic_contacts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint atlantic_contacts_not_self check (requester_id <> addressee_id)
);
create unique index if not exists atlantic_contacts_pair_unique
  on public.atlantic_contacts (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists atlantic_contacts_addressee_status_idx
  on public.atlantic_contacts (addressee_id, status);
create index if not exists atlantic_contacts_requester_status_idx
  on public.atlantic_contacts (requester_id, status);
alter table public.atlantic_contacts enable row level security;
revoke all on public.atlantic_contacts from anon, authenticated;
grant select, insert, delete on public.atlantic_contacts to authenticated;
create policy "Atlantic contacts participants read"
  on public.atlantic_contacts for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Atlantic contacts send own request"
  on public.atlantic_contacts for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and responded_at is null);
create policy "Atlantic contacts participants remove"
  on public.atlantic_contacts for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create schema if not exists private;
create or replace function private.respond_atlantic_contact_request(request_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  changed integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if decision not in ('accepted','rejected') then raise exception 'Invalid decision'; end if;
  update public.atlantic_contacts
     set status = decision, responded_at = now()
   where id = request_id
     and addressee_id = actor
     and status = 'pending';
  get diagnostics changed = row_count;
  if changed = 0 then raise exception 'Permintaan kontak tidak ditemukan atau sudah diproses'; end if;
  return true;
end;
$$;
revoke all on function private.respond_atlantic_contact_request(uuid,text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.respond_atlantic_contact_request(uuid,text) to authenticated;

drop policy if exists "atlantic stories visible" on public.atlantic_stories;
create policy "Atlantic stories visible to mutual contacts"
  on public.atlantic_stories for select to authenticated
  using (
    expires_at > now()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.atlantic_contacts c
        where c.status = 'accepted'
          and ((c.requester_id = (select auth.uid()) and c.addressee_id = atlantic_stories.user_id)
            or (c.addressee_id = (select auth.uid()) and c.requester_id = atlantic_stories.user_id))
      )
    )
  );
drop policy if exists "atlantic notes visible" on public.atlantic_notes;
create policy "Atlantic notes visible to mutual contacts"
  on public.atlantic_notes for select to authenticated
  using (
    expires_at > now()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.atlantic_contacts c
        where c.status = 'accepted'
          and ((c.requester_id = (select auth.uid()) and c.addressee_id = atlantic_notes.user_id)
            or (c.addressee_id = (select auth.uid()) and c.requester_id = atlantic_notes.user_id))
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.atlantic_contacts;
exception when duplicate_object then null;
end $$;
-- Secure one-to-one Atlantic call signaling.
alter table public.atlantic_call_sessions
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

drop policy if exists "atlantic calls requested by caller" on public.atlantic_call_sessions;
create policy "atlantic calls requested by caller"
on public.atlantic_call_sessions for insert to authenticated
with check (
  caller_id = (select auth.uid())
  and callee_id <> (select auth.uid())
  and conversation_id is not null
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = atlantic_call_sessions.conversation_id
      and cm.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = atlantic_call_sessions.conversation_id
      and cm.user_id = atlantic_call_sessions.callee_id
  )
);

-- Clients may only update call state/timestamps, never reassign participants.
revoke update on table public.atlantic_call_sessions from authenticated;
grant update (status, ended_at) on public.atlantic_call_sessions to authenticated;

create table if not exists public.atlantic_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.atlantic_call_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup','decline')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  created_at timestamptz not null default now(),
  constraint atlantic_call_signal_not_self check (sender_id <> recipient_id)
);

create index if not exists atlantic_call_signals_call_created_idx
  on public.atlantic_call_signals(call_id, created_at);

alter table public.atlantic_call_signals enable row level security;

drop policy if exists "atlantic call signals visible to participants" on public.atlantic_call_signals;
create policy "atlantic call signals visible to participants"
on public.atlantic_call_signals for select to authenticated
using (
  (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and exists (
    select 1 from public.atlantic_call_sessions cs
    where cs.id = atlantic_call_signals.call_id
      and (cs.caller_id = (select auth.uid()) or cs.callee_id = (select auth.uid()))
  )
);

drop policy if exists "atlantic call signals sent by participant" on public.atlantic_call_signals;
create policy "atlantic call signals sent by participant"
on public.atlantic_call_signals for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.atlantic_call_sessions cs
    where cs.id = atlantic_call_signals.call_id
      and cs.status in ('requested','accepted')
      and (
        (cs.caller_id = (select auth.uid()) and cs.callee_id = atlantic_call_signals.recipient_id)
        or
        (cs.callee_id = (select auth.uid()) and cs.caller_id = atlantic_call_signals.recipient_id)
      )
  )
);

drop policy if exists "atlantic call signals delete own" on public.atlantic_call_signals;
create policy "atlantic call signals delete own"
on public.atlantic_call_signals for delete to authenticated
using (sender_id = (select auth.uid()));

grant select, insert, delete on public.atlantic_call_signals to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.atlantic_call_sessions;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.atlantic_call_signals;
exception when duplicate_object then null; when undefined_object then null;
end $$;

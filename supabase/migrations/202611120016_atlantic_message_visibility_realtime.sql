-- Publish per-user message visibility changes so other signed-in devices stay in sync.
do $$
begin
  alter publication supabase_realtime add table public.message_user_states;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Ensure every community feed subscribed by the client is in Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.atlantic_channels;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.atlantic_channel_members;
exception when duplicate_object then null; when undefined_object then null; end $$;

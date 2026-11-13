-- Messages are immutable after creation. Delivery/read receipts are handled by
-- record_atlantic_message_receipts; user deletion remains governed by DELETE RLS.
drop policy if exists "Users edit own messages" on public.messages;

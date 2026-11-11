-- Atlantic message replies
-- Run once in Supabase Dashboard > SQL Editor.

alter table public.messages
  add column if not exists reply_to uuid
  references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages(reply_to);

create or replace function public.atlantic_validate_message_reply()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  original_conversation uuid;
begin
  if new.reply_to is null then
    return new;
  end if;

  select conversation_id into original_conversation
  from public.messages
  where id = new.reply_to;

  if original_conversation is null or original_conversation <> new.conversation_id then
    raise exception 'Pesan yang dibalas harus berasal dari percakapan yang sama.';
  end if;

  return new;
end;
$$;

drop trigger if exists atlantic_validate_message_reply on public.messages;
create trigger atlantic_validate_message_reply
before insert or update of reply_to, conversation_id on public.messages
for each row execute function public.atlantic_validate_message_reply();

alter table public.atlantic_polls drop constraint if exists atlantic_polls_question_check;
alter table public.atlantic_polls add constraint atlantic_polls_question_check
check (char_length(trim(question)) between 3 and 2048);
alter table public.atlantic_poll_options drop constraint if exists atlantic_poll_options_label_check;
alter table public.atlantic_poll_options add constraint atlantic_poll_options_label_check
check (char_length(trim(label)) between 1 and 1024);

create or replace function public.create_atlantic_poll(
  p_type text, p_target uuid, p_question text, p_options jsonb,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid; v_option_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_type not in ('group','channel') then raise exception 'Invalid poll target'; end if;
 if p_question is null or char_length(trim(p_question)) not between 3 and 2048 then raise exception 'Invalid encrypted poll question'; end if;
 if jsonb_typeof(p_options)<>'array' then raise exception 'Options must be a list'; end if;
 select count(*) into v_option_count from jsonb_array_elements_text(p_options) x where char_length(trim(x)) between 1 and 1024;
 if v_option_count<2 or v_option_count>8 or v_option_count<>(select count(*) from jsonb_array_elements(p_options)) then raise exception 'Add 2–8 valid encrypted options'; end if;
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if p_type='group' then
   if not public.is_conversation_member(p_target) then raise exception 'Only group members can create polls'; end if;
   if not exists(select 1 from public.conversations c where c.id=p_target and c.is_group=true) then raise exception 'Group not found'; end if;
 else
   if not exists(select 1 from public.atlantic_channels c where c.id=p_target and c.owner_id=(select auth.uid())) then raise exception 'Only channel owners can create polls'; end if;
 end if;
 insert into public.atlantic_polls(target_type,target_id,question,created_by,expires_at)
 values(p_type,p_target,trim(p_question),(select auth.uid()),p_expires_at) returning id into v_id;
 insert into public.atlantic_poll_options(poll_id,label,position)
 select v_id,trim(value),ordinality::integer-1 from jsonb_array_elements_text(p_options) with ordinality;
 return v_id;
end;
$function$;
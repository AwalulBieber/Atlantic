create or replace function public.prevent_e2ee_identity_key_replacement()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.e2ee_public_key is not null
     and new.e2ee_public_key is distinct from old.e2ee_public_key then
    raise exception 'E2EE identity keys are immutable; use the verified device recovery flow.';
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_e2ee_identity_key on public.profiles;
create trigger protect_e2ee_identity_key
before update of e2ee_public_key on public.profiles
for each row execute function public.prevent_e2ee_identity_key_replacement();
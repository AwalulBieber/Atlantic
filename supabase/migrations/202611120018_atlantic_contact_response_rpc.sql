create or replace function public.respond_atlantic_contact_request(request_id uuid, decision text)
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
revoke all on function public.respond_atlantic_contact_request(uuid,text) from public, anon;
grant execute on function public.respond_atlantic_contact_request(uuid,text) to authenticated;
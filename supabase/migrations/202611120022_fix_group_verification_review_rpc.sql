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
  update public.atlantic_group_verification_requests as req
     set status=case when $2 then 'approved' else 'rejected' end,
         admin_note=left(coalesce($3,''),500),
         reviewed_at=now(),reviewed_by=actor
   where req.id=$1 and req.status='pending'
   returning req.conversation_id into target_conversation;
  get diagnostics changed=row_count;
  if changed=0 then raise exception 'Permintaan verifikasi grup tidak ditemukan atau sudah diproses'; end if;
  update public.conversations set is_verified=$2 where id=target_conversation and is_group=true;
  return true;
end;
$$;
revoke all on function public.review_atlantic_group_verification_request(uuid,boolean,text) from public,anon;
grant execute on function public.review_atlantic_group_verification_request(uuid,boolean,text) to authenticated;
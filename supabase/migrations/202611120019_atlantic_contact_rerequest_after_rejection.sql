drop index if exists public.atlantic_contacts_pair_unique;
create unique index atlantic_contacts_active_pair_unique
  on public.atlantic_contacts (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending','accepted');
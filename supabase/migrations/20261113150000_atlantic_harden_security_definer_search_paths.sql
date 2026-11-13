-- Harden every SECURITY DEFINER function in the exposed public schema.
-- Keep trusted system schemas first and the temporary schema last.
do $$
declare f record;
begin
  for f in
    select n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes) as arg_types
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public, auth, pg_temp',
      f.nspname, f.proname, f.arg_types
    );
  end loop;
end
$$;

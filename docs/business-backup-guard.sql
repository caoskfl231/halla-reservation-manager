update halla_restaurant_private.state set snapshot=jsonb_set(snapshot,'{meta,business}','"restaurant"'),snapshot_meta=jsonb_set(snapshot_meta,'{business}','"restaurant"') where id;
do $guard$ declare r record; d text; target text;
begin
for target in select unnest(array['halla_ledger_private','halla_restaurant_private']) loop
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=target and p.proname='validate_snapshot';
 d:=replace(d,'begin',format('begin
 if coalesce(p_snapshot->''meta''->>''business'',''butcher'') <> %L then raise exception ''WRONG_BUSINESS_BACKUP''; end if;',case when target='halla_ledger_private' then 'butcher' else 'restaurant' end));
 execute d;
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=target and p.proname='import_start';
 d:=replace(d,'begin',format('begin
 if coalesce(p_meta->>''business'',''butcher'') <> %L then raise exception ''WRONG_BUSINESS_BACKUP''; end if;',case when target='halla_ledger_private' then 'butcher' else 'restaurant' end));
 execute d;
end loop;end $guard$;
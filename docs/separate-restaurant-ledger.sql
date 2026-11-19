-- Separate restaurant ledger; existing butcher tables/records remain unchanged.
create schema halla_restaurant_private;
revoke all on schema halla_restaurant_private from public,anon,authenticated;
grant usage on schema halla_restaurant_private to authenticated;
create sequence halla_restaurant_private.record_version_seq;
create sequence halla_restaurant_private.transaction_id_seq;
do $clone$
declare r record; ddl text; sig text;
begin
 for r in select relname from pg_class where relnamespace='halla_ledger_private'::regnamespace and relkind='r' loop
 execute format('create table halla_restaurant_private.%I (like halla_ledger_private.%I including all)',r.relname,r.relname);
 execute format('alter table halla_restaurant_private.%I enable row level security',r.relname);
 end loop;
 alter table halla_restaurant_private.records alter column version set default nextval('halla_restaurant_private.record_version_seq');
 for r in select conrelid::regclass::text obj,conname,pg_get_constraintdef(oid) def from pg_constraint where connamespace='halla_ledger_private'::regnamespace and contype='f' loop
 execute 'alter table '||replace(r.obj,'halla_ledger_private','halla_restaurant_private')||' add constraint '||quote_ident(r.conname)||' '||replace(r.def,'halla_ledger_private','halla_restaurant_private');
 end loop;
 -- PL/pgSQL forward references are resolved when called; SQL functions need the tables above.
 for r in select p.oid,p.proname,pg_get_functiondef(p.oid) def,pg_get_function_identity_arguments(p.oid) args from pg_proc p where pronamespace='halla_ledger_private'::regnamespace order by proname loop
 ddl:=replace(r.def,'halla_ledger_private','halla_restaurant_private');
 execute ddl;
 sig:='halla_restaurant_private.'||quote_ident(r.proname)||'('||r.args||')';
 execute 'revoke all on function '||sig||' from public,anon,authenticated';
 if has_function_privilege('authenticated',r.oid,'EXECUTE') then execute 'grant execute on function '||sig||' to authenticated'; end if;
 end loop;
 -- Reuse the same approved members and MFA check without copying membership.
 execute $member$create or replace function halla_restaurant_private.require_member() returns text language sql security definer set search_path='' as 'select halla_ledger_private.require_member()'$member$;
 for r in select p.oid,p.proname,pg_get_functiondef(p.oid) def,pg_get_function_identity_arguments(p.oid) args from pg_proc p where pronamespace='public'::regnamespace and proname like 'halla_ledger_%' loop
 ddl:=replace(replace(r.def,'halla_ledger_private','halla_restaurant_private'),'public.halla_ledger_','public.halla_restaurant_');
 execute ddl;
 sig:='public.'||replace(r.proname,'halla_ledger_','halla_restaurant_')||'('||r.args||')';
 execute 'revoke all on function '||sig||' from public,anon,authenticated';
 if has_function_privilege('authenticated',r.oid,'EXECUTE') then execute 'grant execute on function '||sig||' to authenticated';end if;
 end loop;
 -- Only ledger metadata/backup triggers; do not copy butcher price automation.
 for r in select pg_get_triggerdef(oid) def from pg_trigger where tgrelid='halla_ledger_private.state'::regclass and not tgisinternal loop
 execute replace(r.def,'halla_ledger_private','halla_restaurant_private');
 end loop;
end $clone$;
revoke all on all tables in schema halla_restaurant_private from public,anon,authenticated;
revoke all on all sequences in schema halla_restaurant_private from public,anon,authenticated;
insert into halla_restaurant_private.state(id,snapshot,snapshot_meta,revision)
select true,jsonb_build_object('meta',snapshot_meta,'stores','{}'::jsonb),snapshot_meta,1 from halla_ledger_private.state where id;
select cron.schedule('halla-restaurant-daily-backup','0 18 * * *','select halla_restaurant_private.capture_daily_backup(false)');
notify pgrst,'reload schema';

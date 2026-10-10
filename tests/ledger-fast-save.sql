begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims','{"sub":"fd8a2146-1664-4bca-af63-61ed4924ed4e","role":"authenticated","aal":"aal2"}',true);
do $$
declare base bigint; result jsonb; changes jsonb; started timestamptz; elapsed numeric; snap jsonb; backup jsonb; blocked boolean:=false; n bigint;
begin
select revision into base from halla_ledger_private.state where id;
select jsonb_agg(jsonb_build_object('store','transactions','key',-987654322000-i,'expected_version',0,'data',jsonb_build_object('id',-987654322000-i,'date','2099-01-01','source','sales','batchKey','synthetic-fast-test','amount',i*100))) into changes from generate_series(1,4) i;
started:=clock_timestamp(); result:=public.halla_ledger_patch_compact(changes); elapsed:=extract(epoch from clock_timestamp()-started);
if (result->>'revision')::bigint<>base+1 or jsonb_array_length(result->'row_versions')<>4 then raise exception 'SAVE_FAILED'; end if;
snap:=halla_ledger_private.current_snapshot();
select count(*) into n from jsonb_array_elements(snap->'stores'->'transactions') a where a.value->>'batchKey'='synthetic-fast-test';
if n<>4 then raise exception 'CURRENT_READ_MISSING_ROWS'; end if;
if exists(select 1 from jsonb_array_elements((select snapshot->'stores'->'transactions' from halla_ledger_private.state)) a where a.value->>'batchKey'='synthetic-fast-test') then raise exception 'FAST_SAVE_REBUILT_FULL_SNAPSHOT'; end if;
perform halla_ledger_private.capture_daily_backup(false);
backup:=public.halla_ledger_backup((now() at time zone 'Asia/Seoul')::date);
select count(*) into n from jsonb_array_elements(backup->'stores'->'transactions') a where a.value->>'batchKey'='synthetic-fast-test';
if n<>4 then raise exception 'BACKUP_MISSING_ROWS'; end if;
begin
perform public.halla_ledger_patch_compact(jsonb_build_array(jsonb_build_object('store','transactions','key',-987654322005,'expected_version',0,'data',jsonb_build_object('id',-987654322005,'amount',99)),jsonb_build_object('store','transactions','key',-987654322001,'expected_version',0,'data',jsonb_build_object('id',-987654322001,'amount',99))));
exception when serialization_failure then blocked:=true;
end;
if not blocked or exists(select 1 from halla_ledger_private.records where store_name='transactions' and record_key='-987654322005'::jsonb) then raise exception 'ATOMIC_FAILED'; end if;
perform set_config('test.results',jsonb_build_object('save_seconds',elapsed,'response_bytes',octet_length(result::text),'current_read_four_rows',true,'daily_backup_four_rows',true,'conflict_atomic',true,'base_revision',base)::text,true);
end $$;
select current_setting('test.results') as results;
rollback;

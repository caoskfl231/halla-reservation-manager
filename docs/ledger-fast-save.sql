-- Normalized records are authoritative. Full snapshots are assembled only for reads/backups.
alter table halla_ledger_private.records add column payload_bytes integer generated always as
 (case when row_data is null then 0 else octet_length(row_data::text) end) stored;
alter table halla_ledger_private.state add column snapshot_meta jsonb not null default '{}'::jsonb;
update halla_ledger_private.state set snapshot_meta=snapshot->'meta';
create function halla_ledger_private.keep_snapshot_meta() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.snapshot_meta:=new.snapshot->'meta'; return new; end $$;
revoke all on function halla_ledger_private.keep_snapshot_meta() from public,anon,authenticated;
create trigger ledger_snapshot_metadata before update of snapshot on halla_ledger_private.state
for each row execute function halla_ledger_private.keep_snapshot_meta();
create function halla_ledger_private.current_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('meta',jsonb_set(st.snapshot_meta,'{exportedAt}',to_jsonb(st.updated_at::text)),
 'stores',(select jsonb_object_agg(s.store_name,coalesce(data.rows,'[]'::jsonb))
 from unnest(array['transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']) s(store_name)
 left join (select store_name,jsonb_agg(row_data order by record_key) as rows
 from halla_ledger_private.records where row_data is not null group by store_name) data on data.store_name=s.store_name))
 from halla_ledger_private.state st where id
$$;
revoke all on function halla_ledger_private.current_snapshot() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION halla_ledger_private.patch_compact(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; s text; k jsonb; v bigint; old_version bigint; d jsonb;
 key_field text; meta jsonb; empty_stores jsonb; total_bytes bigint; base_revision bigint; next_revision bigint;
 saved_at timestamptz; versions jsonb; member_role text;
begin
 member_role:=halla_ledger_private.require_member();
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>100000 then raise exception 'INVALID_CHANGES'; end if;
 select snapshot_meta,revision into meta,base_revision from halla_ledger_private.state where id for update;
 if base_revision=0 then raise exception 'INITIALIZE_REQUIRED'; end if;
 if exists(select 1 from jsonb_array_elements(p_changes) a group by a.value->>'store',a.value->'key' having count(*)>1) then raise exception 'DUPLICATE_CHANGE'; end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  s:=c->>'store'; k:=c->'key'; d:=c->'data'; v:=(c->>'expected_version')::bigint;
  if s is null or s not in ('transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups')
   or coalesce(jsonb_typeof(k),'null') not in ('string','number') or v is null or v<0 or d is null then raise exception 'INVALID_CHANGE'; end if;
  key_field:=case when s in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end;
  if d<>'null'::jsonb and (jsonb_typeof(d)<>'object' or d->key_field is distinct from k) then raise exception 'INVALID_RECORD_KEY'; end if;
  select version into old_version from halla_ledger_private.records where store_name=s and record_key=k;
  if coalesce(old_version,0)<>v then raise exception 'LEDGER_RECORD_CONFLICT' using errcode='40001'; end if;
  insert into halla_ledger_private.records(store_name,record_key,row_data)
  values(s,k,case when d='null'::jsonb then null else d end)
  on conflict(store_name,record_key) do update set row_data=excluded.row_data,version=nextval('halla_ledger_private.record_version_seq');
 end loop;
 if exists(select 1 from jsonb_array_elements(p_changes) a where a.value->>'store'='ledger_tx') and
 exists(select 1 from halla_ledger_private.records where store_name='ledger_tx' and row_data->>'fingerprint' is not null
  and row_data->>'fingerprint'<>'' group by row_data->>'fingerprint' having count(*)>1) then raise exception 'DUPLICATE_LEDGER_FINGERPRINT' using errcode='23505'; end if;
 if jsonb_array_length(p_changes)>0 then
  -- Count stored row byte lengths; never rebuild or stringify the full ledger on save.
  select jsonb_object_agg(labels.store_name,'[]'::jsonb) into empty_stores from unnest(array['transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']) labels(store_name);
  meta:=jsonb_set(meta,'{exportedAt}',to_jsonb(now()::text));
  select octet_length(jsonb_build_object('meta',meta,'stores',empty_stores)::text)
   +coalesce(sum(bytes+2*greatest(n-1,0)),0) into total_bytes
  from (select sum(payload_bytes)::bigint as bytes,count(*) as n from halla_ledger_private.records
   where row_data is not null group by store_name) sizes;
  if total_bytes>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
  update halla_ledger_private.state set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 end if;
 select revision,updated_at into next_revision,saved_at from halla_ledger_private.state where id;
 select coalesce(jsonb_agg(jsonb_build_object('store',r.store_name,'key',r.record_key,'version',r.version)),'[]'::jsonb)
 into versions from halla_ledger_private.records r join jsonb_array_elements(p_changes) c
 on r.store_name=c.value->>'store' and r.record_key=c.value->'key';
 return jsonb_build_object('previous_revision',base_revision,'revision',next_revision,'updated_at',saved_at,'role',member_role,'row_versions',versions);
end $function$;

CREATE OR REPLACE FUNCTION halla_ledger_private.read_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text; result jsonb;
begin
 r := halla_ledger_private.require_member();
 select jsonb_build_object('snapshot',halla_ledger_private.current_snapshot(),'revision',revision,'updated_at',updated_at,'role',r,
 'row_versions',coalesce((select jsonb_agg(jsonb_build_object('store',store_name,'key',record_key,'version',version)) from halla_ledger_private.records),'[]'::jsonb))
 into result from halla_ledger_private.state where id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION halla_ledger_private.save_state(p_snapshot jsonb, p_revision bigint, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text; current_row halla_ledger_private.state%rowtype;
begin
 r := halla_ledger_private.require_member();
 if p_action is null or p_action not in ('edit','initialize','restore') then raise exception 'INVALID_ACTION'; end if;
 if p_action <> 'edit' and r <> 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 perform halla_ledger_private.validate_snapshot(p_snapshot);
 select * into current_row from halla_ledger_private.state where id for update;
 if p_revision is null or current_row.revision<>p_revision then raise exception 'LEDGER_CONFLICT' using errcode='40001'; end if;
 if p_action='initialize' and current_row.revision<>0 then raise exception 'ALREADY_INITIALIZED'; end if;
 if p_action='restore' then
  insert into halla_ledger_private.restore_history(revision,snapshot,saved_by)
  values(current_row.revision,halla_ledger_private.current_snapshot(),auth.uid()) on conflict do nothing;
 end if;
 perform halla_ledger_private.sync_records(p_snapshot);
 update halla_ledger_private.state set snapshot=p_snapshot,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 return halla_ledger_private.read_state();
end $function$;

CREATE OR REPLACE FUNCTION halla_ledger_private.import_finish(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job halla_ledger_private.imports%rowtype; current_row halla_ledger_private.state%rowtype; snap jsonb; stores jsonb;
begin
 if halla_ledger_private.require_member()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;
 select * into job from halla_ledger_private.imports where id=p_id and user_id=auth.uid() for update;
 if not found or job.created_at<now()-interval '1 day' then raise exception 'INVALID_IMPORT'; end if;
 if job.completed_revision is not null then return jsonb_build_object('revision',job.completed_revision,'completed',true); end if;
 if (select count(*) from halla_ledger_private.import_chunks where import_id=p_id)<>job.chunk_count
 or exists(select 1 from jsonb_each(job.counts) c where c.value::text::bigint<>(select count(*) from halla_ledger_private.import_rows r where r.import_id=p_id and r.store_name=c.key)) then raise exception 'IMPORT_INCOMPLETE'; end if;
 if exists(select 1 from halla_ledger_private.import_rows where import_id=p_id and store_name='ledger_tx' and coalesce(row_data->>'fingerprint','')<>'' group by row_data->>'fingerprint' having count(*)>1) then raise exception 'DUPLICATE_LEDGER_FINGERPRINT'; end if;
 select * into current_row from halla_ledger_private.state where id for update;
 if current_row.revision<>job.base_revision then raise exception 'LEDGER_CONFLICT' using errcode='40001'; end if;
 if job.action='initialize' and current_row.revision<>0 then raise exception 'ALREADY_INITIALIZED'; end if;
 select jsonb_object_agg(c.key,coalesce(data.rows,'[]'::jsonb)) into stores from jsonb_each(job.counts) c
 left join (select store_name,jsonb_agg(row_data order by ordinal) as rows from halla_ledger_private.import_rows where import_id=p_id group by store_name) data on data.store_name=c.key;
 snap:=jsonb_build_object('meta',job.meta,'stores',coalesce(stores,'{}'::jsonb));
 if octet_length(snap::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 if job.action='restore' then
  insert into halla_ledger_private.restore_history(revision,snapshot,saved_by) values(current_row.revision,halla_ledger_private.current_snapshot(),auth.uid()) on conflict do nothing;
 end if;
 update halla_ledger_private.records r set row_data=null,version=nextval('halla_ledger_private.record_version_seq')
 where r.row_data is not null and not exists(select 1 from halla_ledger_private.import_rows i where i.import_id=p_id and i.store_name=r.store_name and i.record_key=r.record_key);
 insert into halla_ledger_private.records(store_name,record_key,row_data)
 select store_name,record_key,row_data from halla_ledger_private.import_rows where import_id=p_id
 on conflict(store_name,record_key) do update set row_data=excluded.row_data,version=nextval('halla_ledger_private.record_version_seq') where records.row_data is distinct from excluded.row_data;
 update halla_ledger_private.state set snapshot=snap,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 update halla_ledger_private.imports set completed_revision=current_row.revision+1 where id=p_id;
 -- Retain a compact receipt for idempotent finish; discard staged duplicate data.
 delete from halla_ledger_private.import_rows where import_id=p_id;
 return jsonb_build_object('revision',current_row.revision+1,'completed',true);
end $function$;

CREATE OR REPLACE FUNCTION halla_ledger_private.capture_daily_backup(p_initial boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into halla_ledger_private.daily_backups(backup_date,snapshot,revision,item_count,scheduled)
 select (now() at time zone 'Asia/Seoul')::date,snapshot,revision,
 coalesce((select sum(jsonb_array_length(value)) from jsonb_each(snapshot->'stores')),0),not p_initial
 from (select halla_ledger_private.current_snapshot() as snapshot,revision from halla_ledger_private.state where id and revision>0) current_ledger
 on conflict(backup_date) do update set snapshot=excluded.snapshot,revision=excluded.revision,
 created_at=excluded.created_at,item_count=excluded.item_count,scheduled=excluded.scheduled
 where daily_backups.scheduled=false and excluded.scheduled=true;
 delete from halla_ledger_private.daily_backups where backup_date < (now() at time zone 'Asia/Seoul')::date - 29;
end $function$;

create function halla_ledger_private.reserve_transaction_ids(p_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids jsonb;
begin
 perform halla_ledger_private.require_member();
 if p_count is null or p_count<1 or p_count>100000 then raise exception 'INVALID_COUNT'; end if;
 select jsonb_agg(nextval('halla_ledger_private.transaction_id_seq')) into ids from generate_series(1,p_count);
 if exists(select 1 from jsonb_array_elements(ids) i where i.value::text::numeric>9007199254740991) then raise exception 'ID_RANGE_EXCEEDED'; end if;
 return ids;
end $$;
revoke all on function halla_ledger_private.reserve_transaction_ids(integer) from public,anon,authenticated;
grant execute on function halla_ledger_private.reserve_transaction_ids(integer) to authenticated;
create function public.halla_ledger_reserve_transaction_ids(p_count integer) returns jsonb
language sql security invoker set search_path='' as $$ select halla_ledger_private.reserve_transaction_ids(p_count) $$;
revoke all on function public.halla_ledger_reserve_transaction_ids(integer) from public,anon,authenticated;
grant execute on function public.halla_ledger_reserve_transaction_ids(integer) to authenticated;
alter function public.halla_ledger_read() set statement_timeout='60s';
notify pgrst,'reload schema';

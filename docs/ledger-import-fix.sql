create or replace function halla_ledger_private.validate_snapshot(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s record; k text;
begin
 perform halla_ledger_private.require_member();
 if p_snapshot->'meta'->>'dbName' is distinct from 'hallapa_db' or jsonb_typeof(p_snapshot->'stores') is distinct from 'object' then raise exception 'INVALID_SNAPSHOT'; end if;
 if octet_length(p_snapshot::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 for s in select * from jsonb_each(p_snapshot->'stores') loop
  if s.key not in ('transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') or jsonb_typeof(s.value)<>'array' then raise exception 'INVALID_STORE'; end if;
  k:=case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end;
  if exists(select 1 from jsonb_array_elements(s.value) a where jsonb_typeof(a.value)<>'object' or coalesce(jsonb_typeof(a.value->k),'null') not in ('string','number') or a.value->>k='') then raise exception 'INVALID_RECORD_KEY'; end if;
  if exists(select 1 from jsonb_array_elements(s.value) a group by a.value->k having count(*)>1) then raise exception 'DUPLICATE_RECORD_KEY'; end if;
 end loop;
end $$;
create or replace function halla_ledger_private.sync_records(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.validate_snapshot(p_snapshot);
 with incoming as materialized (select s.key as store_name,a.value->(case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end) as record_key,a.value as row_data from jsonb_each(p_snapshot->'stores') s cross join lateral jsonb_array_elements(s.value) a)
 update halla_ledger_private.records r set row_data=null,version=nextval('halla_ledger_private.record_version_seq')
 where r.row_data is not null and not exists(select 1 from incoming i where i.store_name=r.store_name and i.record_key=r.record_key);
 insert into halla_ledger_private.records(store_name,record_key,row_data)
 select s.key as store_name,a.value->(case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end) as record_key,a.value as row_data from jsonb_each(p_snapshot->'stores') s cross join lateral jsonb_array_elements(s.value) a
 on conflict(store_name,record_key) do update set row_data=excluded.row_data,version=nextval('halla_ledger_private.record_version_seq')
 where records.row_data is distinct from excluded.row_data;
end $$;
create or replace function halla_ledger_private.patch_records(p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; s text; k jsonb; v bigint; old_version bigint; d jsonb; key_field text; snap jsonb; store_list jsonb;
begin
 perform halla_ledger_private.require_member();
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>100000 then raise exception 'INVALID_CHANGES'; end if;
 -- One lock gives the batch atomicity; version checks are per record, never per ledger.
 select snapshot into snap from halla_ledger_private.state where id for update;
 if (select revision from halla_ledger_private.state where id)=0 then raise exception 'INITIALIZE_REQUIRED'; end if;
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
 if jsonb_array_length(p_changes)=0 then return halla_ledger_private.read_state(); end if;
 if exists(select 1 from halla_ledger_private.records where store_name='ledger_tx' and row_data->>'fingerprint' is not null
 and row_data->>'fingerprint'<>'' group by row_data->>'fingerprint' having count(*)>1) then raise exception 'DUPLICATE_LEDGER_FINGERPRINT' using errcode='23505'; end if;
 select jsonb_object_agg(stores.store_label,coalesce((select jsonb_agg(r.row_data order by r.record_key) from halla_ledger_private.records r where r.store_name=stores.store_label and r.row_data is not null),'[]'::jsonb))
 into store_list from unnest(array['transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']) stores(store_label);
 snap:=jsonb_set(snap,'{stores}',store_list);
 snap:=jsonb_set(snap,'{meta,exportedAt}',to_jsonb(now()::text));
 if octet_length(snap::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 update halla_ledger_private.state set snapshot=snap,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 return halla_ledger_private.read_state();
end $$;


-- Row versions and atomic partial saves. Old full-backup clients remain compatible.
create sequence halla_ledger_private.record_version_seq;
create sequence halla_ledger_private.transaction_id_seq start with 1000000000000;
create table halla_ledger_private.records (
 store_name text not null,
 record_key jsonb not null,
 row_data jsonb,
 version bigint not null default nextval('halla_ledger_private.record_version_seq'),
 primary key (store_name,record_key)
);
alter table halla_ledger_private.records enable row level security;
create policy records_member on halla_ledger_private.records for select to authenticated
using (exists(select 1 from halla_ledger_private.members m where m.user_id=(select auth.uid())));
revoke all on halla_ledger_private.records from public,anon,authenticated;
revoke all on sequence halla_ledger_private.record_version_seq,halla_ledger_private.transaction_id_seq from public,anon,authenticated;

insert into halla_ledger_private.records(store_name,record_key,row_data)
select s.key, row.value->(case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end),row.value
from halla_ledger_private.state st cross join lateral jsonb_each(st.snapshot->'stores') s
cross join lateral jsonb_array_elements(s.value) row;

create function halla_ledger_private.validate_snapshot(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s record; v jsonb; k text;
begin
 perform halla_ledger_private.require_member();
 if p_snapshot->'meta'->>'dbName' is distinct from 'hallapa_db'
 or jsonb_typeof(p_snapshot->'stores') is distinct from 'object' then raise exception 'INVALID_SNAPSHOT'; end if;
 if octet_length(p_snapshot::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 for s in select * from jsonb_each(p_snapshot->'stores') loop
  if s.key not in ('transactions','users','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups')
  or jsonb_typeof(s.value) <> 'array' then raise exception 'INVALID_STORE'; end if;
  k := case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_types','cashflow_groups') then 'code' else 'id' end;
  for v in select value from jsonb_array_elements(s.value) loop
   if jsonb_typeof(v)<>'object' or coalesce(jsonb_typeof(v->k),'null') not in ('string','number') or v->>k='' then raise exception 'INVALID_RECORD_KEY'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(s.value) r group by r.value->k having count(*)>1) then raise exception 'DUPLICATE_RECORD_KEY'; end if;
 end loop;
end $$;

create function halla_ledger_private.sync_records(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s record; v jsonb; k text;
begin
 perform halla_ledger_private.validate_snapshot(p_snapshot);
 -- Deleted keys retain a tombstone version so stale updates cannot resurrect them.
 update halla_ledger_private.records r set row_data=null,version=nextval('halla_ledger_private.record_version_seq')
 where r.row_data is not null and not exists(
  select 1 from jsonb_array_elements(coalesce(p_snapshot->'stores'->r.store_name,'[]'::jsonb)) a
  where a.value->(case when r.store_name in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end)=r.record_key
 );
 for s in select * from jsonb_each(p_snapshot->'stores') loop
  k := case when s.key in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end;
  for v in select value from jsonb_array_elements(s.value) loop
   insert into halla_ledger_private.records(store_name,record_key,row_data) values(s.key,v->k,v)
   on conflict(store_name,record_key) do update set row_data=excluded.row_data,version=nextval('halla_ledger_private.record_version_seq')
   where records.row_data is distinct from excluded.row_data;
  end loop;
 end loop;
end $$;

create or replace function halla_ledger_private.read_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text; result jsonb;
begin
 r := halla_ledger_private.require_member();
 select jsonb_build_object('snapshot',snapshot,'revision',revision,'updated_at',updated_at,'role',r,
 'row_versions',coalesce((select jsonb_agg(jsonb_build_object('store',store_name,'key',record_key,'version',version)) from halla_ledger_private.records),'[]'::jsonb))
 into result from halla_ledger_private.state where id;
 return result;
end $$;

create or replace function halla_ledger_private.save_state(p_snapshot jsonb,p_revision bigint,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  values(current_row.revision,current_row.snapshot,auth.uid()) on conflict do nothing;
 end if;
 perform halla_ledger_private.sync_records(p_snapshot);
 update halla_ledger_private.state set snapshot=p_snapshot,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 return halla_ledger_private.read_state();
end $$;

create function halla_ledger_private.patch_records(p_changes jsonb) returns jsonb
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
  if s is null or s not in ('transactions','users','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups')
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
 into store_list from unnest(array['transactions','users','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']) stores(store_label);
 snap:=jsonb_set(snap,'{stores}',store_list);
 snap:=jsonb_set(snap,'{meta,exportedAt}',to_jsonb(now()::text));
 if octet_length(snap::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 update halla_ledger_private.state set snapshot=snap,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 return halla_ledger_private.read_state();
end $$;

create function halla_ledger_private.reserve_transaction_id() returns bigint
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 perform halla_ledger_private.require_member();
 loop
  n:=nextval('halla_ledger_private.transaction_id_seq');
  if n>9007199254740991 then raise exception 'TRANSACTION_ID_LIMIT'; end if;
  if not exists(select 1 from halla_ledger_private.records where store_name='transactions' and record_key=to_jsonb(n)) then return n; end if;
 end loop;
end $$;
revoke all on function halla_ledger_private.validate_snapshot(jsonb),halla_ledger_private.sync_records(jsonb),halla_ledger_private.patch_records(jsonb),halla_ledger_private.reserve_transaction_id() from public,anon,authenticated;
grant execute on function halla_ledger_private.patch_records(jsonb),halla_ledger_private.reserve_transaction_id() to authenticated;
create function public.halla_ledger_patch(p_changes jsonb) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.patch_records(p_changes); $$;
create function public.halla_ledger_reserve_transaction_id() returns bigint language sql security invoker set search_path='' as $$ select halla_ledger_private.reserve_transaction_id(); $$;
revoke all on function public.halla_ledger_patch(jsonb),public.halla_ledger_reserve_transaction_id() from public,anon;
grant execute on function public.halla_ledger_patch(jsonb),public.halla_ledger_reserve_transaction_id() to authenticated;

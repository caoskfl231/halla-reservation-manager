-- Keep record-level compare-and-swap, but return only changed versions.
-- Existing legacy RPC remains available to older clients.
create or replace function halla_ledger_private.patch_compact(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; s text; k jsonb; v bigint; old_version bigint; d jsonb;
 key_field text; snap jsonb; rows jsonb; base_revision bigint; next_revision bigint;
 saved_at timestamptz; versions jsonb; member_role text;
begin
 member_role:=halla_ledger_private.require_member();
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>100000 then raise exception 'INVALID_CHANGES'; end if;
 select snapshot,revision into snap,base_revision from halla_ledger_private.state where id for update;
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
 -- Only rebuild stores actually changed, not all twelve stores.
 for s in select distinct a.value->>'store' from jsonb_array_elements(p_changes) a loop
  select coalesce(jsonb_agg(row_data order by record_key),'[]'::jsonb) into rows
   from halla_ledger_private.records where store_name=s and row_data is not null;
  snap:=jsonb_set(snap,array['stores',s],rows,true);
 end loop;
 if jsonb_array_length(p_changes)>0 then
  snap:=jsonb_set(snap,'{meta,exportedAt}',to_jsonb(now()::text));
  if octet_length(snap::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
  update halla_ledger_private.state set snapshot=snap,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 end if;
 select revision,updated_at into next_revision,saved_at from halla_ledger_private.state where id;
 select coalesce(jsonb_agg(jsonb_build_object('store',r.store_name,'key',r.record_key,'version',r.version)),'[]'::jsonb)
 into versions from halla_ledger_private.records r join jsonb_array_elements(p_changes) c
 on r.store_name=c.value->>'store' and r.record_key=c.value->'key';
 return jsonb_build_object('previous_revision',base_revision,'revision',next_revision,'updated_at',saved_at,'role',member_role,'row_versions',versions);
end $$;
revoke all on function halla_ledger_private.patch_compact(jsonb) from public,anon,authenticated;
grant execute on function halla_ledger_private.patch_compact(jsonb) to authenticated;
create or replace function public.halla_ledger_patch_compact(p_changes jsonb)
returns jsonb language sql security invoker set search_path='' set statement_timeout='60s'
as $$ select halla_ledger_private.patch_compact(p_changes) $$;
revoke all on function public.halla_ledger_patch_compact(jsonb) from public,anon,authenticated;
grant execute on function public.halla_ledger_patch_compact(jsonb) to authenticated;
notify pgrst,'reload schema';

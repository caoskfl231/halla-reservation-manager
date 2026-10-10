-- New RPCs preserve old clients; private data, membership and MFA stay protected.
create index if not exists ledger_records_period_version_idx
on halla_ledger_private.records (store_name,(coalesce(substring(row_data->>'date',1,7),'')),version);

create or replace function halla_ledger_private.read_manifest() returns jsonb
language plpgsql security definer set search_path='' as $$
declare st halla_ledger_private.state%rowtype; member_role text; periods jsonb; cur bigint;
begin
 member_role:=halla_ledger_private.require_member();
 select * into st from halla_ledger_private.state where id for share;
 select coalesce(max(version),0) into cur from halla_ledger_private.records;
 select coalesce(jsonb_agg(jsonb_build_object('store',store_name,'period',period,'count',n)
 order by period desc,store_name),'[]'::jsonb) into periods
 from (select store_name,coalesce(substring(row_data->>'date',1,7),'') period,count(*) n
 from halla_ledger_private.records group by store_name,coalesce(substring(row_data->>'date',1,7),'')) groups;
 return jsonb_build_object('full',true,'chunked',true,'revision',st.revision,'cursor',cur,'role',member_role,
 'updated_at',st.updated_at,'meta',jsonb_set(st.snapshot_meta,'{exportedAt}',to_jsonb(st.updated_at::text)),
 'stores',jsonb_build_array('transactions','users','sales_quotes','customers','items','ledger_tx',
 'customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups'),
 'periods',periods);
end $$;
revoke all on function halla_ledger_private.read_manifest() from public,anon,authenticated;
grant execute on function halla_ledger_private.read_manifest() to authenticated;

create or replace function halla_ledger_private.read_period_page(
 p_revision bigint,p_store text,p_period text,p_after bigint default 0,p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; result jsonb; next_version bigint; n integer;
begin
 perform halla_ledger_private.require_member();
 select revision into current_revision from halla_ledger_private.state where id for share;
 if p_revision is null or p_revision<>current_revision then raise exception 'LEDGER_READ_CHANGED' using errcode='40001'; end if;
 if p_store not in ('transactions','users','sales_quotes','customers','items','ledger_tx','customer_types',
 'customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') or p_store is null
 or p_period is null or p_after is null or p_after<0 or p_limit is null or p_limit<1 or p_limit>500
 then raise exception 'INVALID_READ_PAGE'; end if;
 with candidates as (
  select record_key,row_data,version,payload_bytes from halla_ledger_private.records
  where store_name=p_store and coalesce(substring(row_data->>'date',1,7),'')=p_period and version>p_after
  order by version limit p_limit
 ), bounded as (
  select *,row_number() over(order by version) as position,
  sum(payload_bytes+128) over(order by version) as bytes from candidates
 ), page as (select * from bounded where bytes<=524288 or position=1)
 select coalesce(jsonb_agg(jsonb_build_object('key',record_key,'data',row_data,'version',version) order by version),'[]'::jsonb),
 coalesce(max(version),p_after),count(*) into result,next_version,n from page;
 return jsonb_build_object('revision',current_revision,'rows',result,'next',next_version,'count',n);
end $$;
revoke all on function halla_ledger_private.read_period_page(bigint,text,text,bigint,integer) from public,anon,authenticated;
grant execute on function halla_ledger_private.read_period_page(bigint,text,text,bigint,integer) to authenticated;

create or replace function public.halla_ledger_sync_v2(p_cursor bigint default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='60s' as $$
begin
 if p_cursor is null then return halla_ledger_private.read_manifest(); end if;
 return halla_ledger_private.read_delta(p_cursor);
end $$;
revoke all on function public.halla_ledger_sync_v2(bigint) from public,anon;
grant execute on function public.halla_ledger_sync_v2(bigint) to authenticated;
create or replace function public.halla_ledger_period_page(
 p_revision bigint,p_store text,p_period text,p_after bigint default 0,p_limit integer default 500) returns jsonb
language sql security invoker set search_path='' set statement_timeout='30s'
as $$ select halla_ledger_private.read_period_page(p_revision,p_store,p_period,p_after,p_limit) $$;
revoke all on function public.halla_ledger_period_page(bigint,text,text,bigint,integer) from public,anon;
grant execute on function public.halla_ledger_period_page(bigint,text,text,bigint,integer) to authenticated;

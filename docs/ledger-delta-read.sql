-- Every existing writer locks the singleton state before allocating record versions.
-- Tombstones survive full restores, so the global record-version cursor is durable.
create index if not exists ledger_records_version_idx on halla_ledger_private.records(version);
create or replace function halla_ledger_private.read_delta(p_cursor bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member_role text; st halla_ledger_private.state%rowtype; cursor_now bigint; result jsonb;
begin
 member_role:=halla_ledger_private.require_member();
 select * into st from halla_ledger_private.state where id for share;
 select coalesce(max(version),0) into cursor_now from halla_ledger_private.records;
 if p_cursor is null or p_cursor<0 or p_cursor>cursor_now then
  return halla_ledger_private.read_state() || jsonb_build_object('cursor',cursor_now,'full',true);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('store',store_name,'key',record_key,'data',row_data,'version',version) order by version),'[]'::jsonb)
 into result from halla_ledger_private.records where version>p_cursor;
 return jsonb_build_object('full',false,'changes',result,'cursor',cursor_now,'revision',st.revision,
 'updated_at',st.updated_at,'role',member_role,'meta',jsonb_set(st.snapshot_meta,'{exportedAt}',to_jsonb(st.updated_at::text)));
end $$;
revoke all on function halla_ledger_private.read_delta(bigint) from public,anon,authenticated;
grant execute on function halla_ledger_private.read_delta(bigint) to authenticated;
create or replace function public.halla_ledger_sync(p_cursor bigint default null) returns jsonb
language sql security invoker set search_path='' set statement_timeout='60s'
as $$ select halla_ledger_private.read_delta(p_cursor) $$;
revoke all on function public.halla_ledger_sync(bigint) from public,anon;
grant execute on function public.halla_ledger_sync(bigint) to authenticated;

-- Preserve existing authentication and recovery semantics; only enrich history reads.
create index if not exists record_history_record_version
 on halla_ledger_private.record_history(store_name,record_key,old_version);
create or replace function halla_ledger_private.history_record(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform halla_ledger_private.require_member();
 -- The next pre-change image is this update's post-change image, even when
 -- there have been later edits/recoveries. Versions, not wall-clock ties, order it.
 select jsonb_build_object('id',h.id,'store',h.store_name,'key',h.record_key,'data',h.old_data,
  'after_data',case when h.action='delete' then null
                   when successor.id is not null then successor.old_data else r.row_data end,
  'expected_version',r.version,'changed_at',h.changed_at,'action',h.action)
 into result from halla_ledger_private.record_history h
 join halla_ledger_private.records r on r.store_name=h.store_name and r.record_key=h.record_key
 left join lateral (
  select n.id,n.old_data from halla_ledger_private.record_history n
  where n.store_name=h.store_name and n.record_key=h.record_key and n.old_version>h.old_version
  order by n.old_version,n.id limit 1
 ) successor on true
 where h.id=p_id;
 if result is null then raise exception 'HISTORY_NOT_FOUND'; end if;
 return result;
end $$;
revoke all on function halla_ledger_private.history_record(uuid) from public,anon;
grant execute on function halla_ledger_private.history_record(uuid) to authenticated;

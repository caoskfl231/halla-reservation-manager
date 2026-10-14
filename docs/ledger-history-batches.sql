-- Retain the exact database save transaction; never group by approximate timestamps.
alter table halla_ledger_private.record_history add column batch_id text;
-- Existing history is append-only. Preserve its original insert transaction before
-- this metadata update changes xmin. Frozen/unknown IDs safely remain single records.
update halla_ledger_private.record_history
 set batch_id=case when xmin::text in ('0','1','2') then 'legacy-record-'||id::text else 'legacy-xid-'||xmin::text end;
alter table halla_ledger_private.record_history alter column batch_id set default pg_current_xact_id()::text;
alter table halla_ledger_private.record_history alter column batch_id set not null;
create index record_history_batch on halla_ledger_private.record_history(batch_id,old_version,id);
create or replace function halla_ledger_private.history_list(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.require_member();
 return coalesce((select jsonb_agg(to_jsonb(h) order by changed_at desc,id desc)
 from (select id,store_name,record_key,action,changed_at,batch_id,
 coalesce(old_data->>'itemName',old_data->>'name',old_data->>'supplierName',old_data->>'customerName',old_data->>'memo','') as label,
 (select count(*) from halla_ledger_private.record_history b where b.batch_id=record_history.batch_id) as batch_count
 from halla_ledger_private.record_history
 where p_before is null or (p_before_id is null and changed_at<p_before) or (changed_at,id)<(p_before,p_before_id)
 order by changed_at desc,id desc limit 50) h),'[]'::jsonb);
end $$;
create function halla_ledger_private.history_batch(p_id uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch text; result jsonb; total bigint;
begin
 perform halla_ledger_private.require_member();
 if p_offset<0 then raise exception 'INVALID_HISTORY_OFFSET'; end if;
 select batch_id into batch from halla_ledger_private.record_history where id=p_id;
 if batch is null then raise exception 'HISTORY_NOT_FOUND'; end if;
 select count(*) into total from halla_ledger_private.record_history where batch_id=batch;
 select coalesce(jsonb_agg(halla_ledger_private.history_record(h.id)||jsonb_build_object(
  'label',coalesce(h.old_data->>'itemName',h.old_data->>'name',h.old_data->>'supplierName',h.old_data->>'customerName','')) order by h.old_version,h.id),'[]'::jsonb)
 into result from (select id,old_data,old_version from halla_ledger_private.record_history
 where batch_id=batch order by old_version,id limit 50 offset p_offset) h;
 return jsonb_build_object('rows',result,'total',total,'next',p_offset+jsonb_array_length(result));
end $$;
revoke all on function halla_ledger_private.history_batch(uuid,integer) from public,anon;
grant execute on function halla_ledger_private.history_batch(uuid,integer) to authenticated;
create function public.halla_ledger_history_batch(p_id uuid,p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$ select halla_ledger_private.history_batch(p_id,p_offset) $$;
revoke all on function public.halla_ledger_history_batch(uuid,integer) from public,anon;
grant execute on function public.halla_ledger_history_batch(uuid,integer) to authenticated;

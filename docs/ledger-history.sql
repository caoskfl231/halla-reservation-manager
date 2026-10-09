create table halla_ledger_private.record_history (
 id uuid primary key default gen_random_uuid(),
 store_name text not null,record_key jsonb not null,old_data jsonb not null,
 old_version bigint not null, action text not null check(action in ('update','delete')),
 changed_at timestamptz not null default clock_timestamp(), changed_by uuid
);
create index record_history_time on halla_ledger_private.record_history(changed_at desc,id desc);
alter table halla_ledger_private.record_history enable row level security;
create policy history_record_member on halla_ledger_private.record_history for select to authenticated using(exists(select 1 from halla_ledger_private.members m where m.user_id=(select auth.uid())));
revoke all on halla_ledger_private.record_history from public,anon,authenticated;
create function halla_ledger_private.keep_record_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.row_data is not null and old.row_data is distinct from new.row_data then
  insert into halla_ledger_private.record_history(store_name,record_key,old_data,old_version,action,changed_by)
  values(old.store_name,old.record_key,old.row_data,old.version,case when new.row_data is null then 'delete' else 'update' end,auth.uid());
 end if;
 return new;
end $$;
revoke all on function halla_ledger_private.keep_record_history() from public,anon,authenticated;
create trigger preserve_record_before_change before update on halla_ledger_private.records for each row execute function halla_ledger_private.keep_record_history();
create function halla_ledger_private.history_list(p_before timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.require_member();
 return coalesce((select jsonb_agg(to_jsonb(h) order by changed_at desc,id desc)
 from (select id,store_name,record_key,action,changed_at,
 coalesce(old_data->>'supplierName',old_data->>'customerName',old_data->>'name',old_data->>'memo','') as label
 from halla_ledger_private.record_history where p_before is null or changed_at<p_before
 order by changed_at desc,id desc limit 50) h),'[]'::jsonb);
end $$;
create function halla_ledger_private.history_record(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform halla_ledger_private.require_member();
 select jsonb_build_object('id',h.id,'store',h.store_name,'key',h.record_key,'data',h.old_data,
 'expected_version',r.version,'changed_at',h.changed_at,'action',h.action)
 into result from halla_ledger_private.record_history h join halla_ledger_private.records r
 on r.store_name=h.store_name and r.record_key=h.record_key where h.id=p_id;
 if result is null then raise exception 'HISTORY_NOT_FOUND'; end if;
 return result;
end $$;
create function halla_ledger_private.recover_record(p_id uuid,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h halla_ledger_private.record_history%rowtype;
begin
 if halla_ledger_private.require_member()<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 select * into h from halla_ledger_private.record_history where id=p_id;
 if not found then raise exception 'HISTORY_NOT_FOUND'; end if;
 return halla_ledger_private.patch_records(jsonb_build_array(jsonb_build_object(
 'store',h.store_name,'key',h.record_key,'data',h.old_data,'expected_version',p_expected_version)));
end $$;
revoke all on function halla_ledger_private.history_list(timestamptz),halla_ledger_private.history_record(uuid),halla_ledger_private.recover_record(uuid,bigint) from public,anon;
grant execute on function halla_ledger_private.history_list(timestamptz),halla_ledger_private.history_record(uuid),halla_ledger_private.recover_record(uuid,bigint) to authenticated;
create function public.halla_ledger_history(p_before timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.history_list(p_before) $$;
create function public.halla_ledger_history_record(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.history_record(p_id) $$;
create function public.halla_ledger_recover_record(p_id uuid,p_expected_version bigint) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.recover_record(p_id,p_expected_version) $$;
revoke all on function public.halla_ledger_history(timestamptz),public.halla_ledger_history_record(uuid),public.halla_ledger_recover_record(uuid,bigint) from public,anon;
grant execute on function public.halla_ledger_history(timestamptz),public.halla_ledger_history_record(uuid),public.halla_ledger_recover_record(uuid,bigint) to authenticated;
drop function public.halla_ledger_history(timestamptz);
drop function halla_ledger_private.history_list(timestamptz);
create function halla_ledger_private.history_list(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.require_member();
 return coalesce((select jsonb_agg(to_jsonb(h) order by changed_at desc,id desc)
 from (select id,store_name,record_key,action,changed_at,
 coalesce(old_data->>'supplierName',old_data->>'customerName',old_data->>'name',old_data->>'memo','') as label
 from halla_ledger_private.record_history
 where p_before is null or (p_before_id is null and changed_at<p_before) or (changed_at,id)<(p_before,p_before_id)
 order by changed_at desc,id desc limit 50) h),'[]'::jsonb);
end $$;
create function public.halla_ledger_history(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.history_list(p_before,p_before_id) $$;
revoke all on function halla_ledger_private.history_list(timestamptz,uuid),public.halla_ledger_history(timestamptz,uuid) from public,anon;
grant execute on function halla_ledger_private.history_list(timestamptz,uuid),public.halla_ledger_history(timestamptz,uuid) to authenticated;

-- Private staging, owner-only access, MFA inherited from require_member().
create table halla_ledger_private.imports (
 id uuid primary key, user_id uuid not null references auth.users(id), meta jsonb not null,
 counts jsonb not null, chunk_count integer not null, base_revision bigint not null,
 action text not null, created_at timestamptz not null default now(), completed_revision bigint,
 received_bytes bigint not null default 0
);
create table halla_ledger_private.import_chunks (
 import_id uuid references halla_ledger_private.imports(id) on delete cascade,
 chunk_no integer not null, store_name text not null, content_hash text not null,
 row_count integer not null, primary key(import_id,chunk_no)
);
create table halla_ledger_private.import_rows (
 import_id uuid references halla_ledger_private.imports(id) on delete cascade,
 store_name text not null, record_key jsonb not null, row_data jsonb not null,
 ordinal bigint not null, primary key(import_id,store_name,record_key)
);
alter table halla_ledger_private.imports enable row level security;
alter table halla_ledger_private.import_chunks enable row level security;
alter table halla_ledger_private.import_rows enable row level security;
revoke all on halla_ledger_private.imports,halla_ledger_private.import_chunks,halla_ledger_private.import_rows from public,anon,authenticated;

create function halla_ledger_private.import_start(p_id uuid,p_meta jsonb,p_counts jsonb,p_chunks integer,p_revision bigint,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record; n bigint; existing halla_ledger_private.imports%rowtype;
begin
 if halla_ledger_private.require_member()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;
 if p_id is null or p_meta->>'dbName' is distinct from 'hallapa_db' or jsonb_typeof(p_counts) is distinct from 'object'
 or p_chunks is null or p_chunks<0 or p_chunks>2000 or p_revision is null or p_action is null or p_action not in ('initialize','restore')
 or octet_length(p_meta::text)>10000 then raise exception 'INVALID_IMPORT'; end if;
 for s in select * from jsonb_each(p_counts) loop
  if s.key not in ('transactions','users','sales_quotes','customers','items','ledger_tx','customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups')
  or jsonb_typeof(s.value) is distinct from 'number' or s.value::text !~ '^[0-9]+$' then raise exception 'INVALID_STORE'; end if;
 end loop;
 select coalesce(sum(value::text::bigint),0) into n from jsonb_each(p_counts);
 if n>100000 or (n>0 and p_chunks=0) or (n=0 and p_chunks<>0) then raise exception 'INVALID_IMPORT'; end if;
 select * into existing from halla_ledger_private.imports where id=p_id;
 if found then
  if existing.user_id is distinct from auth.uid() or existing.meta<>p_meta or existing.counts<>p_counts or existing.chunk_count<>p_chunks or existing.base_revision<>p_revision or existing.action<>p_action then raise exception 'INVALID_IMPORT_RETRY'; end if;
  return jsonb_build_object('id',p_id,'completed_revision',existing.completed_revision);
 end if;
 if (select revision from halla_ledger_private.state where id)<>p_revision then raise exception 'LEDGER_CONFLICT' using errcode='40001'; end if;
 if p_action='initialize' and p_revision<>0 then raise exception 'ALREADY_INITIALIZED'; end if;
 -- Expired staging is not a backup and never contains active ledger records.
 delete from halla_ledger_private.imports where user_id=auth.uid() and created_at<now()-interval '1 day';
 if (select count(*) from halla_ledger_private.imports where user_id=auth.uid() and completed_revision is null)>=10 then raise exception 'IMPORT_LIMIT'; end if;
 insert into halla_ledger_private.imports(id,user_id,meta,counts,chunk_count,base_revision,action)
 values(p_id,auth.uid(),p_meta,p_counts,p_chunks,p_revision,p_action);
 return jsonb_build_object('id',p_id);
end $$;

create function halla_ledger_private.import_chunk(p_id uuid,p_chunk integer,p_store text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job halla_ledger_private.imports%rowtype; previous halla_ledger_private.import_chunks%rowtype; k text; n integer; size_bytes integer;
begin
 if halla_ledger_private.require_member()<>'owner' then raise exception 'OWNER_REQUIRED'; end if;
 select * into job from halla_ledger_private.imports where id=p_id and user_id=auth.uid() for update;
 if not found or job.created_at<now()-interval '1 day' then raise exception 'INVALID_IMPORT'; end if;
 if p_chunk is null or p_chunk<0 or p_chunk>=job.chunk_count or p_store is null or not job.counts ? p_store
 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'INVALID_CHUNK'; end if;
 n:=jsonb_array_length(p_rows); size_bytes:=octet_length(p_rows::text);
 if n<1 or n>200 or size_bytes>250000 then raise exception 'INVALID_CHUNK_SIZE'; end if;
 select * into previous from halla_ledger_private.import_chunks where import_id=p_id and chunk_no=p_chunk;
 if found then
  if previous.store_name<>p_store or previous.content_hash<>md5(p_rows::text) then raise exception 'INVALID_IMPORT_RETRY'; end if;
  return jsonb_build_object('accepted',true,'chunk',p_chunk);
 end if;
 if job.completed_revision is not null then raise exception 'IMPORT_COMPLETED'; end if;
 if job.received_bytes+size_bytes>24000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 k:=case when p_store in ('customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups') then 'code' else 'id' end;
 if exists(select 1 from jsonb_array_elements(p_rows) a where jsonb_typeof(a.value) is distinct from 'object' or coalesce(jsonb_typeof(a.value->k),'null') not in ('string','number') or a.value->>k='') then raise exception 'INVALID_RECORD_KEY'; end if;
 if n+coalesce((select sum(row_count) from halla_ledger_private.import_chunks where import_id=p_id and store_name=p_store),0)>(job.counts->>p_store)::bigint then raise exception 'INVALID_IMPORT_COUNT'; end if;
 insert into halla_ledger_private.import_rows(import_id,store_name,record_key,row_data,ordinal)
 select p_id,p_store,a.value->k,a.value,p_chunk::bigint*200+a.ordinality from jsonb_array_elements(p_rows) with ordinality a;
 insert into halla_ledger_private.import_chunks values(p_id,p_chunk,p_store,md5(p_rows::text),n);
 update halla_ledger_private.imports set received_bytes=received_bytes+size_bytes where id=p_id;
 return jsonb_build_object('accepted',true,'chunk',p_chunk);
end $$;

create function halla_ledger_private.import_finish(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  insert into halla_ledger_private.restore_history(revision,snapshot,saved_by) values(current_row.revision,current_row.snapshot,auth.uid()) on conflict do nothing;
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
end $$;

create function halla_ledger_private.status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.require_member();
 return (select jsonb_build_object('revision',revision,'updated_at',updated_at) from halla_ledger_private.state where id);
end $$;
create function public.halla_ledger_import_start(p_id uuid,p_meta jsonb,p_counts jsonb,p_chunks integer,p_revision bigint,p_action text) returns jsonb
language sql security invoker set search_path='' as $$select halla_ledger_private.import_start(p_id,p_meta,p_counts,p_chunks,p_revision,p_action)$$;
create function public.halla_ledger_import_chunk(p_id uuid,p_chunk integer,p_store text,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select halla_ledger_private.import_chunk(p_id,p_chunk,p_store,p_rows)$$;
create function public.halla_ledger_import_finish(p_id uuid) returns jsonb
language sql security invoker set search_path='' set statement_timeout='60s' as $$select halla_ledger_private.import_finish(p_id)$$;
create function public.halla_ledger_status() returns jsonb
language sql security invoker set search_path='' as $$select halla_ledger_private.status()$$;
revoke all on function halla_ledger_private.import_start(uuid,jsonb,jsonb,integer,bigint,text),halla_ledger_private.import_chunk(uuid,integer,text,jsonb),halla_ledger_private.import_finish(uuid),halla_ledger_private.status(),public.halla_ledger_import_start(uuid,jsonb,jsonb,integer,bigint,text),public.halla_ledger_import_chunk(uuid,integer,text,jsonb),public.halla_ledger_import_finish(uuid),public.halla_ledger_status() from public,anon,authenticated;
grant execute on function halla_ledger_private.import_start(uuid,jsonb,jsonb,integer,bigint,text),halla_ledger_private.import_chunk(uuid,integer,text,jsonb),halla_ledger_private.import_finish(uuid),halla_ledger_private.status(),public.halla_ledger_import_start(uuid,jsonb,jsonb,integer,bigint,text),public.halla_ledger_import_chunk(uuid,integer,text,jsonb),public.halla_ledger_import_finish(uuid),public.halla_ledger_status() to authenticated;
notify pgrst,'reload schema';

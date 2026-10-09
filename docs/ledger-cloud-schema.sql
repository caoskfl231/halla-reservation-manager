create schema if not exists halla_ledger_private;
revoke all on schema halla_ledger_private from public, anon;
grant usage on schema halla_ledger_private to authenticated;

create table halla_ledger_private.members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','editor')),
 created_at timestamptz not null default now()
);
create table halla_ledger_private.state (
 id boolean primary key default true check (id),
 snapshot jsonb not null,
 revision bigint not null default 0,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create table halla_ledger_private.restore_history (
 revision bigint primary key,
 snapshot jsonb not null,
 saved_at timestamptz not null default now(),
 saved_by uuid references auth.users(id) on delete set null
);
alter table halla_ledger_private.members enable row level security;
alter table halla_ledger_private.state enable row level security;
alter table halla_ledger_private.restore_history enable row level security;
create policy member_self on halla_ledger_private.members for select to authenticated using (user_id=(select auth.uid()));
create policy state_member on halla_ledger_private.state for select to authenticated using (exists(select 1 from halla_ledger_private.members m where m.user_id=(select auth.uid())));
create policy history_member on halla_ledger_private.restore_history for select to authenticated using (exists(select 1 from halla_ledger_private.members m where m.user_id=(select auth.uid())));
-- No client table grants: public RPCs below are the only data access path.
revoke all on all tables in schema halla_ledger_private from public, anon, authenticated;

create function halla_ledger_private.require_member() returns text
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
 select role into r from halla_ledger_private.members where user_id=auth.uid();
 if r is null then raise exception 'LEDGER_ACCESS_DENIED' using errcode='42501'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
 and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
  raise exception 'MFA_REQUIRED' using errcode='42501';
 end if;
 return r;
end $$;

create function halla_ledger_private.read_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; result jsonb;
begin
 r := halla_ledger_private.require_member();
 select jsonb_build_object('snapshot',snapshot,'revision',revision,'updated_at',updated_at,'role',r) into result from halla_ledger_private.state where id;
 return result;
end $$;

create function halla_ledger_private.save_state(p_snapshot jsonb,p_revision bigint,p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; current_row halla_ledger_private.state%rowtype; result jsonb;
begin
 r := halla_ledger_private.require_member();
 if p_action is null or p_action not in ('edit','initialize','restore') then raise exception 'INVALID_ACTION'; end if;
 if p_action <> 'edit' and r <> 'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object'
 or p_snapshot->'meta'->>'dbName' is distinct from 'hallapa_db'
 or jsonb_typeof(p_snapshot->'stores') is distinct from 'object' then raise exception 'INVALID_SNAPSHOT'; end if;
 if octet_length(p_snapshot::text)>25000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 select * into current_row from halla_ledger_private.state where id for update;
 if p_revision is null or current_row.revision<>p_revision then raise exception 'LEDGER_CONFLICT' using errcode='40001'; end if;
 if p_action='initialize' and current_row.revision<>0 then raise exception 'ALREADY_INITIALIZED'; end if;
 if p_action='restore' then
  insert into halla_ledger_private.restore_history(revision,snapshot,saved_by)
  values(current_row.revision,current_row.snapshot,auth.uid()) on conflict do nothing;
 end if;
 update halla_ledger_private.state set snapshot=p_snapshot,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 select jsonb_build_object('snapshot',snapshot,'revision',revision,'updated_at',updated_at,'role',r) into result from halla_ledger_private.state where id;
 return result;
end $$;
revoke all on all functions in schema halla_ledger_private from public, anon, authenticated;
grant execute on function halla_ledger_private.read_state(),halla_ledger_private.save_state(jsonb,bigint,text) to authenticated;

create function public.halla_ledger_read() returns jsonb language sql security invoker set search_path='' as $$
 select halla_ledger_private.read_state();
$$;
create function public.halla_ledger_save(p_snapshot jsonb,p_revision bigint,p_action text default 'edit')
returns jsonb language sql security invoker set search_path='' as $$
 select halla_ledger_private.save_state(p_snapshot,p_revision,p_action);
$$;
revoke all on function public.halla_ledger_read(),public.halla_ledger_save(jsonb,bigint,text) from public,anon;
grant execute on function public.halla_ledger_read(),public.halla_ledger_save(jsonb,bigint,text) to authenticated;
insert into halla_ledger_private.state(snapshot) values
('{"meta":{"dbName":"hallapa_db","dbVersion":13,"exportedAt":"2026-10-09T14:30:00Z","app":"hallapa"},"stores":{}}'::jsonb);
-- Initial ownership follows the existing approved store administrator, not arbitrary Auth signups.
insert into halla_ledger_private.members(user_id,role) select user_id,'owner' from public.admin_users;

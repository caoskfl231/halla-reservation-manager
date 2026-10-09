create table halla_ledger_private.daily_backups (
 backup_date date primary key, snapshot jsonb not null, revision bigint not null,
 created_at timestamptz not null default now(), item_count bigint not null
);
alter table halla_ledger_private.daily_backups enable row level security;
create policy backups_member on halla_ledger_private.daily_backups for select to authenticated using (exists(select 1 from halla_ledger_private.members m where m.user_id=(select auth.uid())));
revoke all on halla_ledger_private.daily_backups from public,anon,authenticated;
-- Only internal triggers and the postgres-owned cron job may call the writer.
create function halla_ledger_private.capture_daily_backup() returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into halla_ledger_private.daily_backups(backup_date,snapshot,revision,item_count)
 select (now() at time zone 'Asia/Seoul')::date,snapshot,revision,
 coalesce((select sum(jsonb_array_length(value)) from jsonb_each(snapshot->'stores')),0)
 from halla_ledger_private.state where id and revision>0
 on conflict(backup_date) do nothing;
 delete from halla_ledger_private.daily_backups where backup_date < (now() at time zone 'Asia/Seoul')::date - 29;
end $$;
revoke all on function halla_ledger_private.capture_daily_backup() from public,anon,authenticated;
create function halla_ledger_private.backup_first_import() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.revision=0 and new.revision>0 then perform halla_ledger_private.capture_daily_backup(); end if;
 return new;
end $$;
revoke all on function halla_ledger_private.backup_first_import() from public,anon,authenticated;
create trigger backup_initial_import after update on halla_ledger_private.state
for each row execute function halla_ledger_private.backup_first_import();
create function halla_ledger_private.list_backups() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform halla_ledger_private.require_member();
 return coalesce((select jsonb_agg(jsonb_build_object('date',backup_date,'created_at',created_at,'revision',revision,'item_count',item_count) order by backup_date desc) from halla_ledger_private.daily_backups),'[]'::jsonb);
end $$;
create function halla_ledger_private.get_backup(p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snap jsonb;
begin
 perform halla_ledger_private.require_member();
 select snapshot into snap from halla_ledger_private.daily_backups where backup_date=p_date;
 if snap is null then raise exception 'BACKUP_NOT_FOUND'; end if;
 return jsonb_set(snap,'{meta,exportedAt}',to_jsonb(now()::text));
end $$;
revoke all on function halla_ledger_private.list_backups(),halla_ledger_private.get_backup(date) from public,anon;
grant execute on function halla_ledger_private.list_backups(),halla_ledger_private.get_backup(date) to authenticated;
create function public.halla_ledger_backups() returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.list_backups() $$;
create function public.halla_ledger_backup(p_date date) returns jsonb language sql security invoker set search_path='' as $$ select halla_ledger_private.get_backup(p_date) $$;
revoke all on function public.halla_ledger_backups(),public.halla_ledger_backup(date) from public,anon;
grant execute on function public.halla_ledger_backups(),public.halla_ledger_backup(date) to authenticated;
select cron.schedule('halla-ledger-daily-backup','0 18 * * *','select halla_ledger_private.capture_daily_backup();');
select halla_ledger_private.capture_daily_backup();
alter table halla_ledger_private.daily_backups add column scheduled boolean not null default true;
drop function halla_ledger_private.capture_daily_backup();
create function halla_ledger_private.capture_daily_backup(p_initial boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into halla_ledger_private.daily_backups(backup_date,snapshot,revision,item_count,scheduled)
 select (now() at time zone 'Asia/Seoul')::date,snapshot,revision,
 coalesce((select sum(jsonb_array_length(value)) from jsonb_each(snapshot->'stores')),0),not p_initial
 from halla_ledger_private.state where id and revision>0
 on conflict(backup_date) do update set snapshot=excluded.snapshot,revision=excluded.revision,
 created_at=excluded.created_at,item_count=excluded.item_count,scheduled=excluded.scheduled
 where daily_backups.scheduled=false and excluded.scheduled=true;
 delete from halla_ledger_private.daily_backups where backup_date < (now() at time zone 'Asia/Seoul')::date - 29;
end $$;
revoke all on function halla_ledger_private.capture_daily_backup(boolean) from public,anon,authenticated;
create or replace function halla_ledger_private.backup_first_import() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.revision=0 and new.revision>0 then perform halla_ledger_private.capture_daily_backup(true); end if;
 return new;
end $$;

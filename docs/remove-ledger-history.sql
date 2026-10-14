drop function if exists public.halla_ledger_history_batch(uuid,integer);
drop function if exists public.halla_ledger_history_record(uuid);
drop function if exists public.halla_ledger_history(timestamptz,uuid);
drop function if exists public.halla_ledger_recover_record(uuid,bigint);
drop function if exists halla_ledger_private.history_batch(uuid,integer);
drop function if exists halla_ledger_private.history_record(uuid);
drop function if exists halla_ledger_private.history_list(timestamptz,uuid);
drop function if exists halla_ledger_private.recover_record(uuid,bigint);
drop trigger if exists preserve_record_before_change on halla_ledger_private.records;
drop function if exists halla_ledger_private.keep_record_history();
-- Retain historical data, with no application access or new capture.
revoke all on halla_ledger_private.record_history from public,anon,authenticated;

begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from halla_ledger_private.members where role='owner' limit 1),'aal','aal2')::text,true);

do $test$
declare s jsonb; baseline jsonb; ck jsonb; tid bigint; lid text; cardid uuid; bankid uuid;
 before_bank numeric; after_bank numeric; before_card numeric; after_card numeric; n integer;
begin
 baseline:=halla_restaurant_private.fund_snapshot();
 select account_id into bankid from halla_restaurant_private.receipt_accounts where method='bank';
 select account_id into cardid from halla_restaurant_private.receipt_accounts where method='card';
 select (value->>'balance')::numeric into before_bank from jsonb_array_elements(baseline->'accounts') where value->>'id'=bankid::text;
 select (value->>'balance')::numeric into before_card from jsonb_array_elements(baseline->'accounts') where value->>'id'=cardid::text;
 select customer_key into ck from halla_restaurant_private.sales_bridge_config where id;
 tid:=halla_ledger_private.reserve_transaction_id();lid:='test-receipt:'||tid;
 insert into halla_ledger_private.records(store_name,record_key,row_data) values
 ('ledger_tx',to_jsonb(lid),jsonb_build_object('id',lid,'date','2026-11-20','flow','in','amount',10000,'paymentMethod','card','cashflowItemName','카드미수금')),
 ('transactions',to_jsonb(tid),jsonb_build_object('id',tid,'date','2026-11-20','type','income','category','sales','source','sales','supplierId',ck,'amount',0,'payment',10000,'paymentDiscount',0,'ledgerTxId',lid));
 s:=halla_restaurant_private.fund_snapshot();
 select (value->>'balance')::numeric into after_card from jsonb_array_elements(s->'accounts') where value->>'id'=cardid::text;
 if after_card<>before_card-10000 then raise exception 'card balance mismatch';end if;
 if (select count(*) from jsonb_array_elements(s->'entries') where value->>'source_id'=tid::text)<>1 then raise exception 'missing or duplicate receipt';end if;
 if exists(select 1 from halla_restaurant_private.records where store_name='transactions' and record_key=to_jsonb(-tid) and row_data is not null) then raise exception 'zero amount receipt copied as purchase';end if;
 if s is distinct from halla_restaurant_private.fund_snapshot() then raise exception 'repeat read not idempotent';end if;
 -- Editing the source amount and method changes the same derived restaurant entry.
 update halla_ledger_private.records set row_data=row_data||jsonb_build_object('payment',15000) where store_name='transactions' and record_key=to_jsonb(tid);
 update halla_ledger_private.records set row_data=row_data||jsonb_build_object('paymentMethod','bank','cashflowItemName','국민통장') where store_name='ledger_tx' and record_key=to_jsonb(lid);
 s:=halla_restaurant_private.fund_snapshot();
 select (value->>'balance')::numeric into after_bank from jsonb_array_elements(s->'accounts') where value->>'id'=bankid::text;
 select (value->>'balance')::numeric into after_card from jsonb_array_elements(s->'accounts') where value->>'id'=cardid::text;
 if after_bank<>before_bank-15000 or after_card<>before_card then raise exception 'source edit not reflected';end if;
 -- Cancellation removes the derived settlement and restores balances.
 update halla_ledger_private.records set row_data=null where store_name='transactions' and record_key=to_jsonb(tid);
 update halla_ledger_private.records set row_data=null where store_name='ledger_tx' and record_key=to_jsonb(lid);
 s:=halla_restaurant_private.fund_snapshot();
 if s is distinct from baseline then raise exception 'cancel did not restore baseline';end if;
 begin
 perform halla_restaurant_private.fund_action('post','{"kind":"purchase"}');
 raise exception 'direct purchase allowed';
 exception when others then if sqlerrm='direct purchase allowed' then raise;end if;end;
 begin
 perform halla_restaurant_private.fund_action('cancel',jsonb_build_object('id','butcher-receipt:'||tid));
 raise exception 'direct cancel allowed';
 exception when others then if sqlerrm='direct cancel allowed' then raise;end if;end;
end $test$;
select 'receipt sync tests passed' result;

rollback;

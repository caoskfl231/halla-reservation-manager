
begin;
do $$
declare uid uuid; claims text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); sale bigint; pk bigint; ck jsonb; ba text; req jsonb; result jsonb; blocked boolean; balance numeric;
begin
 select user_id into uid from halla_ledger_private.members order by created_at limit 1;
 claims:=jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text;
 perform set_config('request.jwt.claims',claims,true);
 perform public.halla_restaurant_funds('account',jsonb_build_object('id',a,'name','__TEST_FUNDS_A_'||a,'kind','bank','opening_date','2026-11-01','opening_balance',1000000));
 perform public.halla_restaurant_funds('account',jsonb_build_object('id',b,'name','__TEST_FUNDS_B_'||b,'kind','cash','opening_date','2026-11-01','opening_balance',0));
 select customer_key into ck from halla_restaurant_private.sales_bridge_config where id;
 select row_data->>'code' into ba from halla_ledger_private.records where store_name='cashflow_items' and row_data is not null and coalesce(row_data->>'status','active')='active' limit 1;
 sale:=halla_ledger_private.reserve_transaction_id();pk:=-sale;
 insert into halla_ledger_private.records(store_name,record_key,row_data) values('transactions',to_jsonb(sale),jsonb_build_object('id',sale,'category','sales','type','income','supplierId',ck,'date','2026-11-19','itemName','__TEST','amount',360500,'quantity',1,'unitPrice',360500));
 req:=jsonb_build_object('id',p,'kind','purchase','date','2026-11-20','account_id',a,'amount',200000,'purchase_ids',jsonb_build_array(pk),'butcher_account',ba,'memo','__TEST');
 result:=public.halla_restaurant_funds('post',req);
 perform public.halla_restaurant_funds('post',req);
 if (select count(*) from halla_restaurant_private.fund_entries where id=p)<>1 then raise exception 'duplicate';end if;
 if (select sum(amount) from halla_restaurant_private.fund_allocations where entry_id=p)<>200000 then raise exception 'allocation';end if;
 if (select count(*) from halla_ledger_private.records where store_name='transactions' and row_data->>'restaurantPaymentId'=p::text)<>1 then raise exception 'receipt';end if;
 if exists(select 1 from halla_restaurant_private.records where store_name='transactions' and row_data->>'linkedSourceTransactionId'=(select butcher_tx_id::text from halla_restaurant_private.fund_entries where id=p)) then raise exception 'receipt_mirrored_as_purchase';end if;
 select (x->>'balance')::numeric into balance from jsonb_array_elements(result->'accounts') x where x->>'id'=a::text;
 if balance<>800000 then raise exception 'balance %',balance;end if;
 blocked:=false;begin perform public.halla_restaurant_funds('post',req||jsonb_build_object('id',gen_random_uuid(),'amount',160501));exception when others then blocked:=true;end;if not blocked then raise exception 'overpay_allowed';end if;
 blocked:=false;begin perform public.halla_restaurant_funds('post',req||jsonb_build_object('amount',100000));exception when others then blocked:=true;end;if not blocked then raise exception 'idempotency_mismatch_allowed';end if;
 blocked:=false;begin update halla_ledger_private.records set row_data=row_data||'{"amount":1}'::jsonb where store_name='transactions' and record_key=to_jsonb(sale);exception when others then blocked:=true;end;if not blocked then raise exception 'paid_sale_edit_allowed';end if;
 blocked:=false;begin update halla_ledger_private.records set row_data=null where store_name='transactions' and row_data->>'restaurantPaymentId'=p::text;exception when others then blocked:=true;end;if not blocked then raise exception 'receipt_delete_allowed';end if;
 perform public.halla_restaurant_funds('post',jsonb_build_object('id',t,'kind','transfer','date','2026-11-20','account_id',a,'to_account_id',b,'amount',100000));
 result:=public.halla_restaurant_funds('cancel',jsonb_build_object('id',p));
 select (x->>'balance')::numeric into balance from jsonb_array_elements(result->'accounts') x where x->>'id'=a::text;
 if balance<>900000 then raise exception 'cancel balance %',balance;end if;
 select (x->>'balance')::numeric into balance from jsonb_array_elements(result->'accounts') x where x->>'id'=b::text;
 if balance<>100000 then raise exception 'transfer balance %',balance;end if;
 if exists(select 1 from halla_ledger_private.records where row_data->>'restaurantPaymentId'=p::text) then raise exception 'receipt_cancel_failed';end if;
 perform public.halla_restaurant_funds('cancel',jsonb_build_object('id',p));
 update halla_ledger_private.records set row_data=row_data||'{"amount":400000}'::jsonb where store_name='transactions' and record_key=to_jsonb(sale);
 perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.halla_restaurant_funds();exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anonymous_access';end if;
 raise notice 'PASS: partial payment, idempotency, allocation, balances, transfer, cancellation, source protection, anonymous denial';
end $$;
rollback;


begin;
do $$
declare uid uuid; cash uuid:=gen_random_uuid(); card uuid:=gen_random_uuid(); useid uuid:=gen_random_uuid(); transferid uuid:=gen_random_uuid(); result jsonb; blocked boolean; n numeric;
begin
 select user_id into uid from halla_ledger_private.members order by created_at limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.halla_restaurant_funds('account',jsonb_build_object('id',cash,'name','__TEST_CASH_'||cash,'kind','cash','opening_date','2026-11-01','opening_balance',500000));
 perform public.halla_restaurant_funds('account',jsonb_build_object('id',card,'name','__TEST_CARD_'||card,'kind','card','opening_date','2026-11-01','opening_balance',-100000));
 perform public.halla_restaurant_funds('post',jsonb_build_object('id',useid,'kind','out','date','2026-11-20','account_id',card,'amount',200000));
 result:=public.halla_restaurant_funds('post',jsonb_build_object('id',transferid,'kind','transfer','date','2026-11-20','account_id',cash,'to_account_id',card,'amount',150000));
 select (x->>'balance')::numeric into n from jsonb_array_elements(result->'accounts') x where x->>'id'=card::text;
 if n<>-150000 then raise exception 'card settlement incorrect %',n;end if;
 select (x->>'balance')::numeric into n from jsonb_array_elements(result->'accounts') x where x->>'id'=cash::text;
 if n<>350000 then raise exception 'cash settlement incorrect';end if;
 blocked:=false;begin perform public.halla_restaurant_funds('post',jsonb_build_object('id',gen_random_uuid(),'kind','transfer','date','2026-11-20','account_id',cash,'to_account_id',cash,'amount',1));exception when others then blocked:=true;end;if not blocked then raise exception 'same account transfer';end if;
 blocked:=false;begin perform public.halla_restaurant_funds('account',jsonb_build_object('id',cash,'version',1,'name','__TEST_CASH_'||cash,'kind','cash','opening_date','2026-11-21','opening_balance',0));exception when others then blocked:=true;end;if not blocked then raise exception 'future opening';end if;
 perform public.halla_restaurant_funds('account',jsonb_build_object('id',cash,'version',1,'name','__TEST_CASH_'||cash,'kind','cash','opening_date','2026-11-01','opening_balance',500000,'archived',true));
 blocked:=false;begin perform public.halla_restaurant_funds('post',jsonb_build_object('id',gen_random_uuid(),'kind','out','date','2026-11-20','account_id',cash,'amount',1));exception when others then blocked:=true;end;if not blocked then raise exception 'archived allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
 blocked:=false;begin perform public.halla_restaurant_funds();exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'nonmember allowed';end if;
end $$;
rollback;


-- Read restaurant settlements from the butcher's saved receipts, never write back.
create table halla_restaurant_private.receipt_accounts (
 method text primary key check(method in ('bank','card','cash')),
 account_id uuid not null references halla_restaurant_private.fund_accounts(id)
);
alter table halla_restaurant_private.receipt_accounts enable row level security;
revoke all on halla_restaurant_private.receipt_accounts from public,anon,authenticated;
insert into halla_restaurant_private.receipt_accounts
select v.method,a.id from (values ('bank','국민통장'),('card','국민카드'),('cash','매장현금')) v(method,name)
join halla_restaurant_private.fund_accounts a on a.name=v.name and a.kind=v.method and not a.archived;
do $$begin
 if (select count(*) from halla_restaurant_private.receipt_accounts)<>3 then raise exception '연결할 식당 계좌를 확인해 주세요.';end if;
 if exists(select 1 from halla_restaurant_private.fund_entries where kind='purchase' and cancelled_at is null) then
 raise exception '기존 식당 지불을 먼저 대조해야 합니다.';end if;
end $$;

create function halla_restaurant_private.butcher_receipts()
returns table(source_id bigint,date date,amount numeric,discount_amount numeric,method text,account_id uuid,memo text,butcher_account text)
language plpgsql security definer set search_path='' as $$
begin
 perform halla_restaurant_private.require_member();
 return query
 with receipts as (
 select r.row_data t,l.row_data l,
 coalesce(i.row_data->>'name',l.row_data->>'cashflowItemName',r.row_data->>'ledgerName','') label
 from halla_ledger_private.records r
 left join halla_ledger_private.records l on l.store_name='ledger_tx' and l.record_key=r.row_data->'ledgerTxId'
 left join halla_ledger_private.records i on i.store_name='cashflow_items'
 and i.record_key=to_jsonb(coalesce(nullif(l.row_data->>'cashflowItemCode',''),nullif(l.row_data->>'cashflowCode',''),l.row_data->>'accountId'))
 where r.store_name='transactions' and r.row_data->>'category'='sales'
 and r.row_data->'supplierId'=(select customer_key from halla_restaurant_private.sales_bridge_config where id)
 and (coalesce((r.row_data->>'payment')::numeric,0)>0 or coalesce((r.row_data->>'paymentDiscount')::numeric,0)>0)
 ), classified as (
 select *,case when label like '%카드%' then 'card'
 when label like '%현금%' then 'cash'
 when label like '%통장%' or label like '%계좌%' then 'bank'
 when l->>'paymentMethod' in ('card','cash','bank') then l->>'paymentMethod'
 else null end payment_method from receipts
 )
 select (c.t->>'id')::bigint,(c.t->>'date')::date,
 coalesce((c.t->>'payment')::numeric,0),coalesce((c.t->>'paymentDiscount')::numeric,0),
 c.payment_method,m.account_id,coalesce(c.t->>'memo',''),c.label
 from classified c left join halla_restaurant_private.receipt_accounts m on m.method=c.payment_method;
end $$;
revoke all on function halla_restaurant_private.butcher_receipts() from public,anon,authenticated;

create or replace function halla_restaurant_private.fund_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform halla_restaurant_private.require_member();
 with receipts as materialized (select * from halla_restaurant_private.butcher_receipts()),
 purchases as (
 select (row_data->>'id')::bigint purchase_id, row_data->>'date' date,(row_data->>'amount')::numeric amount
 from halla_restaurant_private.records where store_name='transactions' and row_data->>'source'='butcher-sales'
 and coalesce((row_data->>'amount')::numeric,0)>0
 ), ordered_purchases as (
 select *,sum(amount) over(order by date,purchase_id desc rows unbounded preceding) endpoint from purchases
 ), totals as (select coalesce(sum(amount+discount_amount),0) settled from receipts),
 allocations as (
 select p.purchase_id,greatest(0,least(p.amount,t.settled-(p.endpoint-p.amount))) amount
 from ordered_purchases p cross join totals t
 ), entry_rows as (
 select e.date,e.created_at,jsonb_build_object('id',e.id,'kind',e.kind,'date',e.date,'account_id',e.account_id,
 'to_account_id',e.to_account_id,'amount',e.amount,'memo',e.memo,'cancelled_at',e.cancelled_at,'butcher_account',e.butcher_account) data
 from halla_restaurant_private.fund_entries e
 union all
 select r.date,r.date::timestamptz,jsonb_build_object('id','butcher-receipt:'||r.source_id,'kind','purchase','date',r.date,
 'account_id',r.account_id,'amount',r.amount,'discount_amount',r.discount_amount,'memo',r.memo,'cancelled_at',null,
 'butcher_account',r.butcher_account,'linked_source','butcher','source_id',r.source_id,'payment_method',r.method,
 'before_opening',r.date<a.opening_date)
 from receipts r left join halla_restaurant_private.fund_accounts a on a.id=r.account_id
 )
 select jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('balance',a.opening_balance+
 coalesce((select sum(case when e.to_account_id=a.id then e.amount when e.kind='in' then e.amount else -e.amount end)
 from halla_restaurant_private.fund_entries e where e.cancelled_at is null and (e.account_id=a.id or e.to_account_id=a.id)),0)
 -coalesce((select sum(r.amount) from receipts r where r.account_id=a.id and r.date>=a.opening_date),0),
 'receipt_method',(select m.method from halla_restaurant_private.receipt_accounts m where m.account_id=a.id)) order by a.created_at)
 from halla_restaurant_private.fund_accounts a),'[]'),
 'entries',coalesce((select jsonb_agg(data order by date desc,created_at desc) from entry_rows),'[]'),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('purchase_id',purchase_id,'amount',amount)) from allocations where amount>0),'[]'),
 'butcher_accounts','[]'::jsonb,
 'butcher_receivable',coalesce((select sum(coalesce((row_data->>'amount')::numeric,0)-coalesce((row_data->>'payment')::numeric,0)-coalesce((row_data->>'paymentDiscount')::numeric,0))
 from halla_ledger_private.records where store_name='transactions' and row_data->>'category'='sales'
 and row_data->'supplierId'=(select customer_key from halla_restaurant_private.sales_bridge_config where id)),0),
 'unmapped_receipts',(select count(*) from receipts where account_id is null),
 'prepayment',greatest(0,(select settled from totals)-coalesce((select sum(amount) from purchases),0)),
 'receipt_sync','butcher'
 ) into result;
 return result;
end $$;

CREATE OR REPLACE FUNCTION halla_restaurant_private.fund_action(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 aid uuid; eid uuid; dest uuid; acc halla_restaurant_private.fund_accounts%rowtype;
 ent halla_restaurant_private.fund_entries%rowtype; amt bigint; dt date; kind text; nm text;
 purchase jsonb; pk bigint; due numeric; remaining bigint; part bigint; keys jsonb;
 ck jsonb; ca jsonb; customer jsonb; txid bigint; receipt jsonb; ledger jsonb; lid text;
begin
 perform halla_restaurant_private.require_member();
 -- Same lock order as the butcher-to-restaurant sale bridge; all money writes serialize.
 perform 1 from halla_ledger_private.state where id for update;
 perform 1 from halla_restaurant_private.state where id for update;
 if p_action='post' and p_data->>'kind'='purchase' then
 raise exception '매입대금은 정육점 매출에서 수금처리해 주세요. 식당에는 자동 반영됩니다.';
 end if;
 if p_action='cancel' and p_data->>'id' like 'butcher-receipt:%' then
 raise exception '정육점에서 수금을 수정·취소해 주세요.';
 end if;
 if p_action='read' then return halla_restaurant_private.fund_snapshot(); end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception '입력 내용을 확인해 주세요.'; end if;
 if p_action='account' then
  aid:=(p_data->>'id')::uuid; nm:=btrim(p_data->>'name');kind:=p_data->>'kind';
  dt:=(p_data->>'opening_date')::date;amt:=(p_data->>'opening_balance')::bigint;
  if aid is null or nm is null or length(nm) not between 1 and 100 or kind is null or kind not in ('cash','bank','card') or dt is null or dt>(now() at time zone 'Asia/Seoul')::date or amt is null then raise exception '계좌명·종류·시작일·시작잔액을 확인해 주세요.'; end if;
  select * into acc from halla_restaurant_private.fund_accounts where id=aid;
  if found then
   if exists(select 1 from halla_restaurant_private.receipt_accounts m where m.account_id=aid)
    and (kind<>acc.kind or coalesce((p_data->>'archived')::boolean,false)) then
    raise exception '정육점 수금과 연결된 계좌는 종류 변경·사용 중지를 할 수 없습니다.';
   end if;
   if acc.version is distinct from (p_data->>'version')::integer then raise exception '다른 기기에서 변경되었습니다. 새로고침 후 다시 수정해 주세요.'; end if;
   if exists(select 1 from halla_restaurant_private.fund_entries where (account_id=aid or to_account_id=aid) and date<dt and cancelled_at is null) then raise exception '거래일보다 늦은 시작일로 변경할 수 없습니다.'; end if;
   if kind<>acc.kind and exists(select 1 from halla_restaurant_private.fund_entries where account_id=aid or to_account_id=aid) then raise exception '거래가 있는 계좌의 종류는 변경할 수 없습니다.'; end if;
   update halla_restaurant_private.fund_accounts set name=nm,kind=p_data->>'kind',opening_date=dt,opening_balance=amt,archived=coalesce((p_data->>'archived')::boolean,false),version=version+1 where id=aid;
  else
   insert into halla_restaurant_private.fund_accounts(id,name,kind,opening_date,opening_balance) values(aid,nm,kind,dt,amt);
  end if;
 elsif p_action='post' then
  eid:=(p_data->>'id')::uuid;
  if eid is null then raise exception '저장 번호가 필요합니다.'; end if;
  select * into ent from halla_restaurant_private.fund_entries where id=eid;
  if found then
   if ent.request_data is distinct from p_data then raise exception '저장 번호가 중복되었습니다. 내역을 확인해 주세요.'; end if;
   return halla_restaurant_private.fund_snapshot();
  end if;
  aid:=(p_data->>'account_id')::uuid;dest:=nullif(p_data->>'to_account_id','')::uuid;
  amt:=(p_data->>'amount')::bigint;dt:=(p_data->>'date')::date;kind:=p_data->>'kind';
  if amt is null or amt<=0 or amt>999999999999 or dt is null or dt>(now() at time zone 'Asia/Seoul')::date or kind is null or kind not in ('in','out','transfer','purchase') then raise exception '날짜·금액·거래 구분을 확인해 주세요.'; end if;
  select * into acc from halla_restaurant_private.fund_accounts where id=aid and not archived;
  if not found or dt<acc.opening_date then raise exception '사용 중인 계좌를 선택하고 시작일 이후로 입력해 주세요.'; end if;
  if kind='transfer' then
   if dest is null or dest=aid or not exists(select 1 from halla_restaurant_private.fund_accounts where id=dest and not archived and opening_date<=dt) then raise exception '받는 계좌와 날짜를 확인해 주세요.'; end if;
   if acc.kind='card' then raise exception '카드는 이체 출금계좌로 사용할 수 없습니다.'; end if;
  elsif dest is not null then raise exception '이체에서만 받는 계좌를 지정할 수 있습니다.';
  end if;
  if kind='purchase' then
   keys:=p_data->'purchase_ids';
   if jsonb_typeof(keys) is distinct from 'array' then raise exception '매입내역을 선택해 주세요.'; end if;
   if jsonb_array_length(keys)=0 or jsonb_array_length(keys)>1000 or (select count(distinct value) from jsonb_array_elements(keys))<>jsonb_array_length(keys) then raise exception '매입내역 선택이 올바르지 않습니다.'; end if;
   select customer_key into ck from halla_restaurant_private.sales_bridge_config where id;
   select row_data into ca from halla_ledger_private.records where store_name='cashflow_items' and record_key=to_jsonb(p_data->>'butcher_account') and coalesce(row_data->>'status','active')='active';
   if ca is null then raise exception '정육점 입금통장을 선택해 주세요.'; end if;
   select row_data into customer from halla_ledger_private.records where store_name='customers' and record_key=ck;
   due:=0;
   for pk in select (value#>>'{}')::bigint from jsonb_array_elements(keys) loop
    select row_data into purchase from halla_restaurant_private.records where store_name='transactions' and record_key=to_jsonb(pk);
    if purchase is null or purchase->>'category' is distinct from 'purchase' or purchase->>'source' is distinct from 'butcher-sales' or purchase->'linkedCustomerId' is distinct from ck then raise exception '연결된 매입내역이 변경되었습니다. 새로고침해 주세요.'; end if;
    if dt<(purchase->>'date')::date then raise exception '지불일은 매입일 이후로 선택해 주세요.'; end if;
    due:=due+greatest(0,(purchase->>'amount')::numeric-coalesce((select sum(a.amount) from halla_restaurant_private.fund_allocations a join halla_restaurant_private.fund_entries e on e.id=a.entry_id where a.purchase_id=pk and e.cancelled_at is null),0));
   end loop;
   if amt>due then raise exception '지불금액이 선택한 매입의 미지급금을 초과합니다.'; end if;
   select coalesce(sum(coalesce((row_data->>'amount')::numeric,0)-coalesce((row_data->>'payment')::numeric,0)-coalesce((row_data->>'paymentDiscount')::numeric,0)),0) into due
   from halla_ledger_private.records where store_name='transactions' and row_data->>'category'='sales' and row_data->'supplierId'=ck;
   if amt>due then raise exception '정육점에 이미 수금된 금액이 있습니다. 정육점 미수금과 지불내역을 확인해 주세요.'; end if;
   txid:=halla_ledger_private.reserve_transaction_id();lid:='restaurant-payment:'||eid::text;
   receipt:=jsonb_build_object('id',txid,'date',dt::text,'type','income','category','sales','source','restaurant-finance','amount',0,'payment',amt,'paymentDiscount',0,'supplierId',ck,'supplierName',coalesce(customer->>'name','할라정육식당'),'supplierGroup',coalesce(customer->>'group',''),'ledgerTxId',lid,'ledgerName',ca->>'name','memo','식당 매입대금 지불 · '||coalesce(p_data->>'memo',''),'restaurantPaymentId',eid::text);
   ledger:=jsonb_build_object('id',lid,'date',dt::text,'flow','in','kind','기타','amount',amt,'source','restaurant-finance','eventType','sales_payment','accountId',ca->>'code','accountName',ca->>'name','cashflowCode',ca->>'code','cashflowItemCode',ca->>'code','cashflowItemName',ca->>'name','paymentMethod',case when ca->>'name' like '%현금%' then 'cash' when ca->>'name' like '%카드%' then 'card' else 'bank' end,'customerId',ck,'supplierId','','item',customer->>'name','vendor',customer->>'name','memo','식당 매입대금 지불','entryMemo',coalesce(p_data->>'memo',''),'preferEntryMemo',true,'createdAt',(extract(epoch from now())*1000)::bigint,'updatedAt',(extract(epoch from now())*1000)::bigint,'restaurantPaymentId',eid::text);
  end if;
  insert into halla_restaurant_private.fund_entries(id,kind,date,account_id,to_account_id,amount,memo,request_data,created_by,butcher_tx_id,butcher_account,receipt_data,ledger_data)
  values(eid,kind,dt,aid,dest,amt,coalesce(p_data->>'memo',''),p_data,auth.uid(),txid,case when kind='purchase' then p_data->>'butcher_account' end,receipt,ledger);
  if kind='purchase' then
   remaining:=amt;
   for pk in select (value#>>'{}')::bigint from jsonb_array_elements(keys) loop
    select row_data into purchase from halla_restaurant_private.records where store_name='transactions' and record_key=to_jsonb(pk);
    due:=(purchase->>'amount')::numeric-coalesce((select sum(a.amount) from halla_restaurant_private.fund_allocations a join halla_restaurant_private.fund_entries e on e.id=a.entry_id where a.purchase_id=pk and e.cancelled_at is null),0);
    part:=least(remaining,greatest(0,due));
    if part>0 then insert into halla_restaurant_private.fund_allocations values(eid,pk,part);remaining:=remaining-part;end if;
   end loop;
   if remaining<>0 then raise exception '지불 배분에 실패했습니다.'; end if;
   insert into halla_ledger_private.records(store_name,record_key,row_data) values('transactions',to_jsonb(txid),receipt),('ledger_tx',to_jsonb(lid),ledger);
   update halla_ledger_private.state set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
  end if;
 elsif p_action='cancel' then
  eid:=(p_data->>'id')::uuid;select * into ent from halla_restaurant_private.fund_entries where id=eid;
  if not found then raise exception '지불내역을 찾을 수 없습니다.'; end if;
  if ent.cancelled_at is not null then return halla_restaurant_private.fund_snapshot();end if;
  update halla_restaurant_private.fund_entries set cancelled_at=now(),cancelled_by=auth.uid() where id=eid;
  if ent.kind='purchase' then
   update halla_ledger_private.records set row_data=null,version=nextval('halla_ledger_private.record_version_seq')
   where (store_name='transactions' and record_key=to_jsonb(ent.butcher_tx_id)) or (store_name='ledger_tx' and record_key=to_jsonb('restaurant-payment:'||eid::text));
   update halla_ledger_private.state set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
  end if;
 else raise exception '지원하지 않는 자금관리 요청입니다.';
 end if;
 return halla_restaurant_private.fund_snapshot();
end $function$;

CREATE OR REPLACE FUNCTION halla_restaurant_private.sync_butcher_sale(p_key jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; destination jsonb; current_data jsonb; item jsonb; target_key jsonb; customer_key jsonb; target_id bigint;
begin
 -- Source transaction IDs are positive safe integers; a separate negative namespace
 -- prevents clashes with independently allocated restaurant transaction IDs.
 if jsonb_typeof(p_key)<>'number' or (p_key#>>'{}') !~ '^[0-9]+$' then return; end if;
 target_id:=-(p_key#>>'{}')::bigint;
 if target_id>=0 then return; end if;
 target_key:=to_jsonb(target_id);
 select c.customer_key into customer_key from halla_restaurant_private.sales_bridge_config c where id;
 select r.row_data into s from halla_ledger_private.records r where store_name='transactions' and record_key=p_key;
 if s->>'source' is distinct from 'restaurant-finance' and s->>'category'='sales' and s->>'type'='income' and s->'supplierId'=customer_key and coalesce((s->>'amount')::numeric,0)<>0 then
  select row_data into item from halla_ledger_private.records where store_name='items' and record_key=s->'itemId';
  destination:=jsonb_build_object(
   'id',target_id,'type','expense','category','purchase','source','butcher-sales',
   'date',s->>'date','supplierId','halla-butcher','supplierName','할라정육점',
   'itemId','butcher:'||coalesce(s->>'itemId',''),'itemCode',s->>'itemCode',
   'itemName',s->>'itemName','itemSpec',s->>'itemSpec',
   'itemGroup',coalesce(nullif(s->>'itemGroup',''),nullif(item->>'group',''),'미분류'),
   'unit',s->>'unit','quantity',s->'quantity','unitPrice',s->'unitPrice',
   'amount',s->'amount','supplyAmount',s->'supplyAmount','taxAmount',s->'taxAmount','taxType',s->>'taxType',
   'memo',coalesce(s->>'memo',''),'batchKey','butcher:'||coalesce(s->>'batchKey',p_key::text),
   'linkedSourceBusiness','butcher','linkedSourceTransactionId',p_key,
   'linkedCustomerId',customer_key,'sourceBatchKey',s->>'batchKey'
  );
 end if;
 -- Serialize all restaurant changes with the same state lock used by its RPCs.
 perform 1 from halla_restaurant_private.state where id for update;
 select row_data into current_data from halla_restaurant_private.records where store_name='transactions' and record_key=target_key;
 if current_data is not null and current_data->>'source' is distinct from 'butcher-sales' then
  raise exception 'RESTAURANT_LINK_ID_COLLISION';
 end if;
 if current_data is not distinct from destination then return; end if;
 insert into halla_restaurant_private.records(store_name,record_key,row_data)
 values('transactions',target_key,destination)
 on conflict(store_name,record_key) do update set row_data=excluded.row_data,version=nextval('halla_restaurant_private.record_version_seq');
 update halla_restaurant_private.state set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
end $function$;


-- Remove only zero-amount mirrors previously created from receipt-only transactions.
do $$declare k jsonb;begin
 perform 1 from halla_ledger_private.state where id for update;
 perform 1 from halla_restaurant_private.state where id for update;
 for k in select row_data->'linkedSourceTransactionId' from halla_restaurant_private.records
 where store_name='transactions' and row_data->>'source'='butcher-sales'
 and coalesce((row_data->>'amount')::numeric,0)=0 loop
 perform halla_restaurant_private.sync_butcher_sale(k);
 end loop;
end $$;

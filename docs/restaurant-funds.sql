
create table halla_restaurant_private.fund_accounts (
 id uuid primary key, name text not null check(length(name) between 1 and 100),
 kind text not null check(kind in ('cash','bank','card')),
 opening_date date not null, opening_balance bigint not null check(abs(opening_balance)<=999999999999),
 archived boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now()
);
create unique index fund_accounts_active_name on halla_restaurant_private.fund_accounts(lower(name)) where not archived;
create table halla_restaurant_private.fund_entries (
 id uuid primary key, kind text not null check(kind in ('in','out','transfer','purchase')),
 date date not null, account_id uuid not null references halla_restaurant_private.fund_accounts,
 to_account_id uuid references halla_restaurant_private.fund_accounts,
 amount bigint not null check(amount>0 and amount<=999999999999),
 memo text not null default '' check(length(memo)<=1000),
 request_data jsonb not null, created_by uuid not null, created_at timestamptz not null default now(),
 cancelled_at timestamptz, cancelled_by uuid,
 butcher_tx_id bigint, butcher_account text, receipt_data jsonb, ledger_data jsonb
);
create table halla_restaurant_private.fund_allocations (
 entry_id uuid not null references halla_restaurant_private.fund_entries,
 purchase_id bigint not null, amount bigint not null check(amount>0),
 primary key(entry_id,purchase_id)
);
create index fund_allocations_purchase on halla_restaurant_private.fund_allocations(purchase_id);
alter table halla_restaurant_private.fund_accounts enable row level security;
alter table halla_restaurant_private.fund_entries enable row level security;
alter table halla_restaurant_private.fund_allocations enable row level security;
revoke all on halla_restaurant_private.fund_accounts,halla_restaurant_private.fund_entries,halla_restaurant_private.fund_allocations from public,anon,authenticated;

create function halla_restaurant_private.fund_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform halla_restaurant_private.require_member();
 select jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('balance',a.opening_balance+
 coalesce((select sum(case when e.to_account_id=a.id then e.amount when e.kind='in' then e.amount else -e.amount end)
 from halla_restaurant_private.fund_entries e where e.cancelled_at is null and (e.account_id=a.id or e.to_account_id=a.id)),0)) order by a.created_at)
 from halla_restaurant_private.fund_accounts a),'[]'),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'date',e.date,'account_id',e.account_id,'to_account_id',e.to_account_id,'amount',e.amount,'memo',e.memo,'cancelled_at',e.cancelled_at,'butcher_account',e.butcher_account) order by e.date desc,e.created_at desc) from halla_restaurant_private.fund_entries e),'[]'),
 'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from halla_restaurant_private.fund_allocations a join halla_restaurant_private.fund_entries e on e.id=a.entry_id where e.cancelled_at is null),'[]'),
 'butcher_accounts',coalesce((select jsonb_agg(jsonb_build_object('code',row_data->>'code','name',row_data->>'name') order by row_data->>'code') from halla_ledger_private.records where store_name='cashflow_items' and row_data is not null and coalesce(row_data->>'status','active')='active'),'[]'),
 'butcher_receivable',coalesce((select sum(coalesce((row_data->>'amount')::numeric,0)-coalesce((row_data->>'payment')::numeric,0)-coalesce((row_data->>'paymentDiscount')::numeric,0)) from halla_ledger_private.records where store_name='transactions' and row_data->>'category'='sales' and row_data->'supplierId'=(select customer_key from halla_restaurant_private.sales_bridge_config where id)),0)
 ) into result;
 return result;
end $$;

create function halla_restaurant_private.fund_action(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if p_action='read' then return halla_restaurant_private.fund_snapshot(); end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception '입력 내용을 확인해 주세요.'; end if;
 if p_action='account' then
  aid:=(p_data->>'id')::uuid; nm:=btrim(p_data->>'name');kind:=p_data->>'kind';
  dt:=(p_data->>'opening_date')::date;amt:=(p_data->>'opening_balance')::bigint;
  if aid is null or nm is null or length(nm) not between 1 and 100 or kind is null or kind not in ('cash','bank','card') or dt is null or dt>(now() at time zone 'Asia/Seoul')::date or amt is null then raise exception '계좌명·종류·시작일·시작잔액을 확인해 주세요.'; end if;
  select * into acc from halla_restaurant_private.fund_accounts where id=aid;
  if found then
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
end $$;

-- Preserve linked receipts and paid purchases against edits through other screens.
create or replace function halla_restaurant_private.guard_fund_links()
returns trigger language plpgsql security definer set search_path='' as $$
declare k jsonb; s text; d jsonb; linked halla_restaurant_private.fund_entries%rowtype;
begin
 if TG_OP='DELETE' then k:=old.record_key;s:=old.store_name;d:=null;
 else k:=new.record_key;s:=new.store_name;d:=new.row_data;end if;
 if TG_TABLE_SCHEMA='halla_ledger_private' then
  select * into linked from halla_restaurant_private.fund_entries where
   (s='transactions' and to_jsonb(butcher_tx_id)=k) or
   (s='ledger_tx' and to_jsonb('restaurant-payment:'||id::text)=k) limit 1;
  if found then
   if (linked.cancelled_at is null and d is distinct from case when s='transactions' then linked.receipt_data else linked.ledger_data end)
    or (linked.cancelled_at is not null and d is not null) then
    raise exception '식당에서 연결한 지불내역입니다. 식당 자금관리에서 취소 후 다시 등록해 주세요.';
   end if;
  end if;
 end if;
 if TG_OP<>'INSERT' and s='transactions' and (TG_OP='DELETE' or old.row_data is distinct from d) then
  if exists(select 1 from halla_restaurant_private.fund_allocations a join halla_restaurant_private.fund_entries e on e.id=a.entry_id
    where e.cancelled_at is null and to_jsonb(case when TG_TABLE_SCHEMA='halla_ledger_private' then -a.purchase_id else a.purchase_id end)=k) then
    raise exception '지불된 매입내역입니다. 식당 자금관리에서 지불을 취소한 뒤 원본을 수정해 주세요.';
  end if;
 end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
create trigger protect_restaurant_fund_links before insert or update or delete on halla_ledger_private.records for each row execute function halla_restaurant_private.guard_fund_links();
create trigger protect_restaurant_paid_purchase before update or delete on halla_restaurant_private.records for each row execute function halla_restaurant_private.guard_fund_links();

create function public.halla_restaurant_funds(p_action text default 'read',p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select halla_restaurant_private.fund_action(p_action,p_data)$$;
revoke all on function halla_restaurant_private.fund_snapshot(),halla_restaurant_private.fund_action(text,jsonb),halla_restaurant_private.guard_fund_links(),public.halla_restaurant_funds(text,jsonb) from public,anon;
grant usage on schema halla_restaurant_private to authenticated;
grant execute on function halla_restaurant_private.fund_action(text,jsonb),public.halla_restaurant_funds(text,jsonb) to authenticated;

create or replace function halla_restaurant_private.sync_butcher_sale(p_key jsonb)
returns void language plpgsql security definer set search_path='' as $$
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
 if s->>'source' is distinct from 'restaurant-finance' and s->>'category'='sales' and s->>'type'='income' and s->'supplierId'=customer_key then
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
end $$;

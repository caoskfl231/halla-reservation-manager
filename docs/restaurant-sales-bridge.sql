
create table halla_restaurant_private.sales_bridge_config (
 id boolean primary key default true check(id),
 customer_key jsonb not null
);
alter table halla_restaurant_private.sales_bridge_config enable row level security;
revoke all on halla_restaurant_private.sales_bridge_config from public,anon,authenticated;
do $$
begin
 if (select count(*) from halla_ledger_private.records where store_name='customers' and row_data->>'name'='할라정육식당')<>1 then raise exception 'RESTAURANT_CUSTOMER_NOT_UNIQUE'; end if;
 insert into halla_restaurant_private.sales_bridge_config(customer_key)
 select record_key from halla_ledger_private.records where store_name='customers' and row_data->>'name'='할라정육식당';
end $$;

create function halla_restaurant_private.sync_butcher_sale(p_key jsonb)
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
revoke all on function halla_restaurant_private.sync_butcher_sale(jsonb) from public,anon,authenticated;

create function halla_restaurant_private.on_butcher_sale()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.store_name='transactions' then perform halla_restaurant_private.sync_butcher_sale(old.record_key); end if;
 else
  if new.store_name='transactions' then perform halla_restaurant_private.sync_butcher_sale(new.record_key); end if;
 end if;
 return null;
end $$;
revoke all on function halla_restaurant_private.on_butcher_sale() from public,anon,authenticated;
create trigger restaurant_purchase_from_sale
after insert or update or delete on halla_ledger_private.records
for each row execute function halla_restaurant_private.on_butcher_sale();

-- Backfill only this explicitly configured restaurant customer's sales.
do $$
declare k jsonb;
begin
 for k in select record_key from halla_ledger_private.records
 where store_name='transactions' and row_data->>'category'='sales'
 and row_data->'supplierId'=(select customer_key from halla_restaurant_private.sales_bridge_config where id)
 loop perform halla_restaurant_private.sync_butcher_sale(k); end loop;
end $$;

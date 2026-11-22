-- Add guarded account deletion without changing existing posting/receipt logic.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('halla_restaurant_private.fund_action(text,jsonb)'::regprocedure) into definition;
 if position('p_action=''delete_account''' in definition)>0 then raise exception 'delete_account already exists'; end if;
 if position('elsif p_action=''post'' then' in definition)=0 then raise exception 'fund_action layout changed'; end if;
 definition:=replace(definition,'elsif p_action=''post'' then',$branch$
 elsif p_action='delete_account' then
  aid:=(p_data->>'id')::uuid;
  if aid is null then raise exception '삭제할 계좌를 선택해 주세요.'; end if;
  select * into acc from halla_restaurant_private.fund_accounts where id=aid;
  if not found then return halla_restaurant_private.fund_snapshot(); end if;
  if acc.version is distinct from (p_data->>'version')::integer then
   raise exception '다른 기기에서 변경되었습니다. 새로고침 후 다시 삭제해 주세요.';
  end if;
  if exists(select 1 from halla_restaurant_private.receipt_accounts where account_id=aid) then
   raise exception '정육점 수금과 연결된 계좌·카드는 삭제할 수 없습니다.';
  end if;
  if exists(select 1 from halla_restaurant_private.fund_entries where account_id=aid or to_account_id=aid) then
   raise exception '거래내역이 있는 계좌·카드는 삭제할 수 없습니다. 수정에서 사용 중지해 주세요.';
  end if;
  delete from halla_restaurant_private.fund_accounts where id=aid;
 elsif p_action='post' then
 $branch$);
 execute definition;
end $migration$;

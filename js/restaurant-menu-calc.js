export function menuPrice({costPerKg,grams,margin}){
 const c=Number(costPerKg),g=Number(grams),m=Number(margin)/100;
 if(!Number.isFinite(c)||c<=0||c>1e10||!Number.isFinite(g)||g<=0||g>1e6)throw Error('매입단가와 판매 중량을 0보다 크게 입력해 주세요.');
 if(!Number.isFinite(m)||m<0||m>=1)throw Error('마진율은 0% 이상 100% 미만으로 입력해 주세요.');
 const denominator=1-m;
 const cost=c*g/1000,withoutVat=cost/(1-m),price=Math.ceil((cost*1.1/denominator)-1e-8);
 return {...actualMargin(price,cost),cost,withoutVat,price,margin:m*100};
}
export function actualMargin(price,cost){
 const p=Number(price),c=Number(cost);
 if(!Number.isFinite(p)||p<=0||p>1e14||!Number.isFinite(c)||c<0)throw Error('적용 판매가를 올바르게 입력해 주세요.');
 const supply=p/1.1,vat=p-supply,profit=supply-c;
 return {supply,vat,profit,actualMargin:profit/supply*100};
}
export function latestKgPurchases(records){
 const map=new Map();
 for(const r of records.filter(r=>r.category==='purchase'&&/^(kg|㎏|킬로그램)$/i.test(String(r.unit||'').trim())&&Number(r.unitPrice)>0).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id),undefined,{numeric:true}))){
  const key=String(r.itemId||r.itemName);if(!map.has(key))map.set(key,r);
 }return [...map.values()];
}

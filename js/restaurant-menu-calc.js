export function menuPrice({costPerKg,grams,margin,cardRate=0}){
 const c=Number(costPerKg),g=Number(grams),m=Number(margin)/100,f=Number(cardRate)/100;
 if(!Number.isFinite(c)||c<=0||c>1e10||!Number.isFinite(g)||g<=0||g>1e6)throw Error('매입단가와 판매 중량을 0보다 크게 입력해 주세요.');
 if(!Number.isFinite(m)||m<0||m>=1||!Number.isFinite(f)||f<0||f>=1)throw Error('마진율과 수수료율을 확인해 주세요.');
 const denominator=1-m-1.1*f;
 if(denominator<=0)throw Error('목표 마진율과 카드수수료가 너무 높아 판매가를 계산할 수 없습니다.');
 const cost=c*g/1000,withoutVat=cost/(1-m),price=Math.ceil((cost*1.1/denominator)-1e-8);
 return {...actualMargin(price,cost,f*100),cost,withoutVat,price,margin:m*100,cardRate:f*100};
}
export function actualMargin(price,cost,cardRate=0){
 const p=Number(price),c=Number(cost),f=Number(cardRate)/100;
 if(!Number.isFinite(p)||p<=0||p>1e14||!Number.isFinite(c)||c<0||!Number.isFinite(f)||f<0||f>=1)throw Error('적용 판매가를 올바르게 입력해 주세요.');
 const supply=p/1.1,vat=p-supply,fee=p*f,profit=supply-c-fee;
 return {supply,vat,fee,profit,actualMargin:profit/supply*100};
}
export function latestKgPurchases(records){
 const map=new Map();
 for(const r of records.filter(r=>r.category==='purchase'&&/^(kg|㎏|킬로그램)$/i.test(String(r.unit||'').trim())&&Number(r.unitPrice)>0).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id),undefined,{numeric:true}))){
  const key=String(r.itemId||r.itemName);if(!map.has(key))map.set(key,r);
 }return [...map.values()];
}

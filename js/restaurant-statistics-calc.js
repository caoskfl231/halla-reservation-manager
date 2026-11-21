export function summarizeRestaurant(transactions,items,groups,from,to){
 const total={gross:0,purchase:0,expense:0,vat:0,fee:0,salesCount:0,purchaseCount:0,expenseCount:0};
 const purchases=new Map(),expenses=new Map(),itemMap=new Map(items.map(r=>[String(r.id),r]));
 const groupMap=new Map(groups.filter(r=>r.source==='restaurant-expense-groups').map(r=>[r.name,r.displayName||r.name]));
 const amount=r=>{const n=Number(r);return Number.isFinite(n)?n:0};
 const add=(map,key,value)=>map.set(key,(map.get(key)||0)+value);
 for(const r of transactions){
  if(!r||!r.date||r.date<from||r.date>to)continue;
  if(r.source==='restaurant-sales'){
   total.gross+=amount(r.amount);total.vat+=amount(r.vat);total.fee+=amount(r.cardFee);total.salesCount++;
  }else if(r.category==='purchase'){
   const value=amount(r.amount);total.purchase+=value;total.purchaseCount++;
   add(purchases,r.itemGroup||itemMap.get(String(r.itemId))?.group||'미분류',value);
  }else if(r.category==='expense'){
   const value=amount(r.amount);total.expense+=value;total.expenseCount++;
   const key=r.expenseGroup||'기타';add(expenses,groupMap.get(key)||key,value);
  }
 }
 total.remaining=total.gross-total.purchase-total.expense;
 total.adjusted=total.remaining-total.vat-total.fee;
 return {...total,purchases:[...purchases].sort((a,b)=>b[1]-a[1]),expenses:[...expenses].sort((a,b)=>b[1]-a[1])};
}
export const salesRatio=(amount,gross)=>gross>0?amount/gross*100:null;

export function forecast(rows,days,fixed){
 if(!Number.isInteger(days)||days<1||days>31)throw Error('월 영업일수는 1~31일로 입력해 주세요.');
 if(!Number.isFinite(fixed)||fixed<0)throw Error('고정비를 확인해 주세요.');
 let revenue=0,materials=0,fees=0;
 for(const r of rows){
 if(!r.name.trim()||![r.price,r.cost,r.fee,r.qty].every(Number.isFinite)||r.price<=0||r.cost<0||r.fee<0||r.fee>=100||!Number.isInteger(r.qty)||r.qty<0)throw Error('메뉴명·판매가·원가·수수료·수량을 확인해 주세요.');
 revenue+=r.price*r.qty;materials+=r.cost*r.qty;fees+=r.price*r.qty*r.fee/100;
 }
 const contribution=revenue-materials-fees,monthlyRevenue=revenue*days,profit=contribution*days-fixed;
 if(![revenue,materials,fees,contribution,monthlyRevenue,profit].every(Number.isFinite))throw Error('입력값이 너무 큽니다.');
 return {revenue,materials,fees,contribution,monthlyRevenue,monthlyMaterials:materials*days,monthlyFees:fees*days,profit,margin:monthlyRevenue?profit/monthlyRevenue*100:null,breakEven:contribution>0?fixed/(contribution/revenue):null};
}

export function directForecast(v,days,fixed){
 const values=[v.sales,v.meatPurchase,v.vegPurchase,v.foodPurchase,v.monthlyFee];
 if(!values.every(n=>Number.isFinite(n)&&n>=0))throw Error('매출·매입·수수료 금액은 0 이상으로 입력해 주세요.');
 forecast([],days,fixed);
 const monthlyMaterials=v.meatPurchase+v.vegPurchase+v.foodPurchase,contribution=v.sales-monthlyMaterials-v.monthlyFee,profit=contribution-fixed;
 if(![monthlyMaterials,contribution,profit].every(Number.isFinite))throw Error('입력값이 너무 큽니다.');
 return {revenue:v.sales/days,materials:monthlyMaterials/days,fees:v.monthlyFee/days,contribution:contribution/days,monthlyRevenue:v.sales,monthlyMaterials,monthlyFees:v.monthlyFee,profit,margin:v.sales?profit/v.sales*100:null,breakEven:contribution>0?fixed/(contribution/v.sales):null};
}
export function afterSavings(profit,savings){
 if(!Number.isFinite(savings)||savings<0)throw Error('적금은 0 이상으로 입력해 주세요.');
 return profit-savings;
}

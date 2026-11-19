export function calculate(v,mode='margin'){
 const {cost,base,weight,loss,side,sauce,other,fee}=v;
 if (![cost,base,weight,loss,side,sauce,other,fee].every(Number.isFinite)||cost<0||base<=0||weight<=0||loss<0||loss>=100||[side,sauce,other,fee].some(x=>x<0)||fee>=100) throw Error('원가·중량·감량률·비용을 확인해 주세요.');
 const meat=cost*weight/base/(1-loss/100), total=meat+side+sauce+other;
 let price=v.price;
 if(mode==='margin'){if(!Number.isFinite(v.margin)||v.margin+fee>=100)throw Error('마진율과 수수료율 합계는 100% 미만이어야 합니다.');price=Math.round(total/(1-(v.margin+fee)/100));}
 if(!Number.isFinite(price)||price<=0)throw Error('판매가격과 원가를 입력해 주세요.');
 const card=price*fee/100,profit=price-total-card;
 return {meat,total,price,card,profit,margin:profit/price*100};
}
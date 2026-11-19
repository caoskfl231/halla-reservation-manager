export function monthlyBalance(sales,expenses,savings){
 if(![sales,savings,...expenses].every(n=>Number.isFinite(n)&&n>=0))throw Error('금액은 0 이상의 숫자로 입력해 주세요.');
 const total=expenses.reduce((a,b)=>a+b,0),balance=sales-total,remaining=balance-savings;
 if(![total,balance,remaining].every(Number.isFinite))throw Error('입력 금액이 너무 큽니다.');
 const ratio=n=>sales>0?n/sales*100:null;
 return {total,balance,remaining,ratios:expenses.map(ratio),totalRatio:ratio(total),balanceRatio:ratio(balance),savingsRatio:ratio(savings),remainingRatio:ratio(remaining)};
}

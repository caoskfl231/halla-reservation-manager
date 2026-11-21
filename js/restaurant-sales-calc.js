export function calculateSale(amount,paymentMethod='카드',feeRate=3){
 const gross=Number(amount),rate=Number(feeRate);
 if(!Number.isSafeInteger(gross)||gross<0||gross>999999999999)throw Error('매출액을 올바른 원 단위 금액으로 입력해 주세요.');
 if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('수수료율은 0~100%로 입력해 주세요.');
 if(!['카드','현금','계좌이체'].includes(paymentMethod))throw Error('결제수단을 선택해 주세요.');
 const vat=Math.round(gross/11),cardFee=paymentMethod==='카드'?Math.round(gross*rate/100):0,netSales=gross-vat-cardFee;
 if(netSales<0)throw Error('수수료와 부가세의 합계가 매출액을 초과합니다.');
 return {amount:gross,vat,cardFee,netSales,feeRate:paymentMethod==='카드'?rate:0};
}

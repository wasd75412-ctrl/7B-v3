function positiveWholeNumber(value){
  const number=Number(value);
  return Number.isFinite(number)&&number>0?Math.round(number):0;
}

export function calculatePerPersonFee(rentalTotal,participantCount){
  const total=positiveWholeNumber(rentalTotal),participants=positiveWholeNumber(participantCount);
  return total&&participants?Math.ceil(total/participants):0;
}

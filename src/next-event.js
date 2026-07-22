function positiveWholeNumber(value){
  const number=Number(value);
  return Number.isFinite(number)&&number>0?Math.round(number):0;
}

export function calculatePerPersonFee(rentalTotal,participantCount){
  const total=positiveWholeNumber(rentalTotal),participants=positiveWholeNumber(participantCount);
  return total&&participants?Math.ceil(total/participants):0;
}

const DATE_KEY=/^\d{4}-\d{2}-\d{2}$/;

export function shouldShowNextEventAnnouncement(eventDate,todayDate){
  const event=String(eventDate||''),today=String(todayDate||'');
  return DATE_KEY.test(event)&&DATE_KEY.test(today)&&event>=today;
}

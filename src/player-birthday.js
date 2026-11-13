const MONTH_LENGTHS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function birthdayDayCount(month){
  const value = Number(month);
  return Number.isInteger(value) ? MONTH_LENGTHS[value] || 0 : 0;
}

export function normalizePlayerBirthday(month, day){
  const birthMonth = Number(month);
  const birthDay = Number(day);
  const max = birthdayDayCount(birthMonth);
  if(!max || !Number.isInteger(birthDay) || birthDay < 1 || birthDay > max) return {birthMonth:0, birthDay:0};
  return {birthMonth, birthDay};
}

export function playerBirthdayLabel(player){
  const {birthMonth, birthDay} = normalizePlayerBirthday(player?.birthMonth, player?.birthDay);
  return birthMonth ? `${birthMonth}月${birthDay}日` : '未設定';
}

function calendarParts(date = new Date()){
  if(date instanceof Date){
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }
  const text = String(date || '');
  return {
    year: Number(text.slice(0, 4)),
    month: Number(text.slice(5, 7)),
    day: Number(text.slice(8, 10))
  };
}

function isLeapYear(year){
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isBirthdayMonth(player, date = new Date()){
  const {birthMonth} = normalizePlayerBirthday(player?.birthMonth, player?.birthDay);
  if(!birthMonth) return false;
  return birthMonth === calendarParts(date).month;
}

export function isBirthdayDay(player, date = new Date()){
  const {birthMonth, birthDay} = normalizePlayerBirthday(player?.birthMonth, player?.birthDay);
  if(!birthMonth) return false;
  const {year, month, day} = calendarParts(date);
  if(birthMonth === month && birthDay === day) return true;
  // Celebrate Feb 29 birthdays on Feb 28 in non-leap years.
  return birthMonth === 2 && birthDay === 29 && month === 2 && day === 28 && !isLeapYear(year);
}

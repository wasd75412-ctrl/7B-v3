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

export function isBirthdayMonth(player, date = new Date()){
  const {birthMonth} = normalizePlayerBirthday(player?.birthMonth, player?.birthDay);
  if(!birthMonth) return false;
  const month = date instanceof Date ? date.getMonth() + 1 : Number(String(date).slice(5, 7));
  return birthMonth === month;
}

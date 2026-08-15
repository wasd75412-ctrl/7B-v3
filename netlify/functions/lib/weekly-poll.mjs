export const TAIPEI_OFFSET_MS=8*60*60*1000;
export const WEEKLY_POLL_LOCATION='立羽會館';
export const WEEKLY_POLL_START='01:00';
export const WEEKLY_POLL_END='04:00';

function dateKeyFromUtcDate(date){return date.toISOString().slice(0,10)}

export function taipeiWeekSchedule(now=Date.now()){
  const local=new Date(now+TAIPEI_OFFSET_MS);
  const day=local.getUTCDay();
  const daysSinceMonday=(day+6)%7;
  const monday=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-daysSinceMonday));
  const deadlineLocalMs=monday.getTime()+5*86400000+12*3600000;
  const deadlineAt=new Date(deadlineLocalMs-TAIPEI_OFFSET_MS).toISOString();
  const nextMonday=new Date(monday.getTime()+7*86400000);
  const cycle=dateKeyFromUtcDate(monday);
  const options=Array.from({length:7},(_,index)=>({
    id:`weekly-${cycle}-${index+1}`,
    date:dateKeyFromUtcDate(new Date(nextMonday.getTime()+index*86400000)),
    time:WEEKLY_POLL_START,
    endTime:WEEKLY_POLL_END,
    note:WEEKLY_POLL_LOCATION
  }));
  return{cycle,mondayLocalMs:monday.getTime(),deadlineAt,options};
}

export function shouldOpenWeeklyPoll(document,now=Date.now()){
  const schedule=taipeiWeekSchedule(now),localNow=now+TAIPEI_OFFSET_MS;
  if(localNow<schedule.mondayLocalMs||now>=Date.parse(schedule.deadlineAt))return false;
  return document?.fields?.weeklyPollCycle?.stringValue!==schedule.cycle;
}

function stringValue(value){return{stringValue:value}}

export function weeklyPollFirestoreValue(now=Date.now()){
  const schedule=taipeiWeekSchedule(now),createdAt=new Date(now).toISOString();
  return{mapValue:{fields:{
    status:stringValue('open'),
    createdAt:stringValue(createdAt),
    deadlineAt:stringValue(schedule.deadlineAt),
    autoCycle:stringValue(schedule.cycle),
    options:{arrayValue:{values:schedule.options.map(option=>({
      mapValue:{fields:Object.fromEntries(Object.entries(option).map(([key,value])=>[key,stringValue(value)]))}
    }))}},
    votes:{mapValue:{fields:{}}},
    voterPlayers:{mapValue:{fields:{}}}
  }}};
}

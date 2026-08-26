export const TAIPEI_OFFSET_MS=8*60*60*1000;
export const WEEKLY_POLL_LOCATION='立羽';
export const WEEKLY_POLL_START='01:00';
export const WEEKLY_POLL_END='04:00';
export const WEEKLY_POLL_NOON_START='11:00';
export const WEEKLY_POLL_NOON_END='13:00';

function dateKeyFromUtcDate(date){return date.toISOString().slice(0,10)}

export function taipeiWeekSchedule(now=Date.now()){
  const local=new Date(now+TAIPEI_OFFSET_MS);
  const day=local.getUTCDay();
  const daysSinceMonday=(day+6)%7;
  const monday=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-daysSinceMonday));
  const opensLocalMs=monday.getTime()+12*3600000;
  const opensAt=new Date(opensLocalMs-TAIPEI_OFFSET_MS).toISOString();
  const deadlineLocalMs=monday.getTime()+5*86400000+12*3600000;
  const deadlineAt=new Date(deadlineLocalMs-TAIPEI_OFFSET_MS).toISOString();
  const nextMonday=new Date(monday.getTime()+7*86400000);
  const cycle=dateKeyFromUtcDate(monday);
  const options=Array.from({length:7},(_,index)=>{
    const date=dateKeyFromUtcDate(new Date(nextMonday.getTime()+index*86400000)),day=index+1;
    return[
      {id:`weekly-${cycle}-${day}`,date,time:WEEKLY_POLL_START,endTime:WEEKLY_POLL_END,note:WEEKLY_POLL_LOCATION},
      {id:`weekly-${cycle}-${day}-noon`,date,time:WEEKLY_POLL_NOON_START,endTime:WEEKLY_POLL_NOON_END,note:WEEKLY_POLL_LOCATION}
    ]
  }).flat();
  return{cycle,mondayLocalMs:monday.getTime(),opensAt,deadlineAt,options};
}

export function shouldOpenWeeklyPoll(document,now=Date.now()){
  const schedule=taipeiWeekSchedule(now);
  if(now<Date.parse(schedule.opensAt)||now>=Date.parse(schedule.deadlineAt))return false;
  return document?.fields?.weeklyPollCycle?.stringValue!==schedule.cycle;
}

export function weeklyPollPushPayload({siteUrl,roomId,cycle}){
  return{
    title:'🏸 新投票開始了',
    body:'下週球局投票已開放，請前往投票。',
    url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=poll`,
    icon:`${siteUrl}/icons/icon-192.png`,
    badge:`${siteUrl}/icons/icon-192.png`,
    tag:`7b-weekly-poll-${roomId}-${cycle}`
  };
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

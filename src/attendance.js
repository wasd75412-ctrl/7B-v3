export function updateAttendanceState(source={},playerId='',attending=false){
  const id=String(playerId||'');
  const unique=values=>[...new Set((Array.isArray(values)?values:[]).filter(Boolean))];
  const attendance=unique(source.attendance);
  const nextAttendance=attending
    ?unique([...attendance,id])
    :attendance.filter(value=>value!==id);
  const removePlayer=values=>unique(values).filter(value=>value!==id);
  const nextCall=source.nextCall&&Array.isArray(source.nextCall.players)&&source.nextCall.players.includes(id)
    ?null
    :source.nextCall||null;
  const court=attending?unique(source.court):removePlayer(source.court);
  const waitingQueue=attending
    ?unique([...(source.waitingQueue||[]),...(court.includes(id)?[]:[id])]).filter(value=>nextAttendance.includes(value)&&!court.includes(value))
    :removePlayer(source.waitingQueue);
  const queueDraftChosen=attending?unique(source.queueDraftChosen):removePlayer(source.queueDraftChosen);
  return{
    attendance:nextAttendance,
    court,
    waitingQueue,
    queueDraftChosen,
    priority:waitingQueue[0]||null,
    nextCall
  };
}

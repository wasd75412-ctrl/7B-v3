export function normalizeGender(value){
  return value==='male'||value==='female'?value:'';
}

export function malePairCount(lineup,getGender){
  if(!Array.isArray(lineup)||lineup.length<4)return 0;
  const isMale=id=>normalizeGender(getGender(id))==='male';
  return Number(isMale(lineup[0])&&isMale(lineup[1]))+
    Number(isMale(lineup[2])&&isMale(lineup[3]));
}

export function arrangeLineupByGender(ids,getGender){
  const lineup=[...(ids||[])];
  if(lineup.length!==4)return lineup;
  const [a,b,c,d]=lineup;
  const candidates=[
    [a,b,c,d],
    [a,c,b,d],
    [a,d,b,c]
  ];
  return candidates.reduce((best,candidate)=>
    malePairCount(candidate,getGender)<malePairCount(best,getGender)?candidate:best
  );
}

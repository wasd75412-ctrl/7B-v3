export const PLAYER_TYPE_MEMBER='member';
export const PLAYER_TYPE_GUEST='guest';

export function normalizePlayerType(value){
  return value===PLAYER_TYPE_GUEST?PLAYER_TYPE_GUEST:PLAYER_TYPE_MEMBER;
}

export function isGuestPlayer(player={}){
  return normalizePlayerType(player?.memberType)===PLAYER_TYPE_GUEST;
}

export function splitPlayersByMembership(players=[]){
  const members=[];
  const guests=[];
  for(const player of Array.isArray(players)?players:[]){
    (isGuestPlayer(player)?guests:members).push(player);
  }
  return{members,guests};
}

export function shuttleEligiblePlayers(players=[]){
  return (Array.isArray(players)?players:[]).filter(player=>!isGuestPlayer(player));
}

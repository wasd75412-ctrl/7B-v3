export const PLAYER_TYPE_MEMBER='member';
export const PLAYER_TYPE_GUEST='guest';

export function normalizePlayerType(value){
  return value===PLAYER_TYPE_GUEST?PLAYER_TYPE_GUEST:PLAYER_TYPE_MEMBER;
}

export function isGuestPlayer(){
  return false;
}

export function splitPlayersByMembership(players=[]){
  return{members:Array.isArray(players)?[...players]:[],guests:[]};
}

export function shuttleEligiblePlayers(players=[]){
  return Array.isArray(players)?[...players]:[];
}

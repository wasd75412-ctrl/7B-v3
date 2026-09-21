export const PLAYER_GENDER_UNSPECIFIED='';
export const PLAYER_GENDER_MALE='male';
export const PLAYER_GENDER_FEMALE='female';

export function normalizePlayerGender(value){
  return value===PLAYER_GENDER_MALE||value===PLAYER_GENDER_FEMALE?value:PLAYER_GENDER_UNSPECIFIED;
}

export function playerGenderLabel(value){
  const gender=normalizePlayerGender(value);
  return gender===PLAYER_GENDER_MALE?'男性':gender===PLAYER_GENDER_FEMALE?'女性':'未設定';
}

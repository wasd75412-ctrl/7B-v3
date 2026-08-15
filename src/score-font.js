export const SCORE_FONTS=Object.freeze([
  'audiowide','black-ops-one','bungee','monoton',
  'orbitron','oxanium','press-start-2p','russo-one'
]);

export function normalizeScoreFont(value){
  return SCORE_FONTS.includes(value)?value:SCORE_FONTS[0];
}

export function randomScoreFont(current='',randomValue=Math.random()){
  const choices=SCORE_FONTS.filter(font=>font!==current);
  const safeRandom=Number.isFinite(randomValue)?Math.min(Math.max(randomValue,0),.999999999):0;
  return choices[Math.floor(safeRandom*choices.length)]||SCORE_FONTS[0];
}

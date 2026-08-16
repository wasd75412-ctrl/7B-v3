export const PLAYER_SCORE_THEME_LINKS=Object.freeze({
  '建昱':['vspo-hbl','vspo','vspo-snut','happy-panda'],
  '于萱':['blue-stage','the-star'],
  '于瑄':['suisei-2023-09','suisei-2024-07','suisei-2026-01'],
  '宇恬':['pudding-pattern','pudding-hug','pudding-collection','pudding-puppy'],
  '慧璇':['sanrio-party','bow-kitty'],
  '禹彤':['three-eyed-pattern'],
  '于萱Jr.':['gbc-grass','girls-band','girls-band-fashion'],
  '川景':['jujutsu']
});

const cleanPlayerNames=names=>[...new Set((names||[]).map(name=>String(name||'').trim()).filter(Boolean))];

export function linkedScoreThemesForPlayers(playerNames=[]){
  return [...new Set(cleanPlayerNames(playerNames).flatMap(name=>PLAYER_SCORE_THEME_LINKS[name]||[]))];
}

export function linkedScorePlayerCount(playerNames=[]){
  return cleanPlayerNames(playerNames).filter(name=>PLAYER_SCORE_THEME_LINKS[name]?.length).length;
}

export function scoreThemeCandidates({themes=[],current='',playerNames=[],preferenceWeight=5}={}){
  const available=[...new Set(themes)].filter(Boolean);
  const withoutCurrent=available.filter(theme=>theme!==current);
  const ordinary=withoutCurrent.length?withoutCurrent:available;
  const linked=linkedScoreThemesForPlayers(playerNames).filter(theme=>available.includes(theme));
  if(!linked.length)return ordinary;
  const linkedWithoutCurrent=linked.filter(theme=>theme!==current);
  const preferred=linkedWithoutCurrent.length?linkedWithoutCurrent:linked;
  if(linkedScorePlayerCount(playerNames)>=2)return preferred;
  const extraWeight=Math.max(1,Math.floor(preferenceWeight));
  return [...ordinary,...Array.from({length:extraWeight},()=>preferred).flat()];
}

export function chooseScoreTheme(options={},random=Math.random){
  const candidates=scoreThemeCandidates(options);
  if(!candidates.length)return'happy-panda';
  const value=Math.min(.999999999,Math.max(0,Number(random())||0));
  return candidates[Math.floor(value*candidates.length)];
}

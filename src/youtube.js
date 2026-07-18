export function normalizeYouTubePlaylistUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return'';
  const candidate=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
  try{
    const url=new URL(candidate);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const isYouTube=host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtu.be';
    if(!isYouTube)return'';
    const studioId=host==='studio.youtube.com'?url.pathname.match(/\/playlist\/([A-Za-z0-9_-]+)/)?.[1]:'';
    const playlistId=(url.searchParams.get('list')||studioId||'').trim();
    if(!/^[A-Za-z0-9_-]{8,160}$/.test(playlistId))return'';
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  }catch{
    return'';
  }
}

export function normalizeMatchReplayTitle(value){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,60);
}

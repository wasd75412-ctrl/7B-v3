export const CHAT_MESSAGE_MAX_LENGTH=500;
export const CHAT_MENTION_MAX_COUNT=8;
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function cleanChatText(value,maxLength=CHAT_MESSAGE_MAX_LENGTH){
  return String(value??'')
    .replace(/\r\n?/g,'\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
    .trim()
    .slice(0,maxLength);
}

export function normalizeChatMentionIds(values,{validIds=[],senderId='',maxCount=CHAT_MENTION_MAX_COUNT}={}){
  const allowed=new Set((validIds||[]).map(String)),seen=new Set(),result=[];
  for(const value of Array.isArray(values)?values:[]){
    const id=String(value||'').trim();
    if(!id||id===String(senderId||'')||seen.has(id)||(allowed.size&&!allowed.has(id)))continue;
    seen.add(id);result.push(id);
    if(result.length>=maxCount)break;
  }
  return result;
}

export function chatMentionSearch(value,caret){
  const text=String(value??''),end=Math.max(0,Math.min(Number.isFinite(caret)?caret:text.length,text.length));
  const before=text.slice(0,end),match=before.match(/(?:^|[\s\p{P}\p{S}])@([^\s@]*)$/u);
  if(!match)return null;
  return{query:match[1],start:before.lastIndexOf('@'),end};
}

export function mentionIdsFromText(value,players=[],{senderId='',maxCount=CHAT_MENTION_MAX_COUNT}={}){
  const text=String(value??''),matches=[];
  for(const [order,player] of (Array.isArray(players)?players:[]).entries()){
    const id=String(player?.id||''),name=String(player?.name||'').trim();
    if(!id||!name||id===String(senderId||''))continue;
    const match=new RegExp(`@${escapeRegExp(name)}(?=$|[\\s\\p{P}\\p{S}])`,'u').exec(text);
    if(match)matches.push({id,index:match.index,order});
  }
  matches.sort((a,b)=>a.index-b.index||a.order-b.order);
  return normalizeChatMentionIds(matches.map(match=>match.id),{senderId,maxCount});
}

export function removeChatMention(value,name){
  const pattern=new RegExp(`@${escapeRegExp(String(name||'').trim())}(?=$|[\\s\\p{P}\\p{S}])\\s*`,'gu');
  return String(value??'').replace(pattern,'').replace(/[ \t]{2,}/g,' ');
}

export function chatMessagePreview(value,maxLength=90){
  const text=cleanChatText(value,CHAT_MESSAGE_MAX_LENGTH).replace(/\s+/g,' ');
  return text.length<=maxLength?text:`${text.slice(0,Math.max(1,maxLength-1)).trimEnd()}…`;
}

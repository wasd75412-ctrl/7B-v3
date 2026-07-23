export const CHAT_MESSAGE_MAX_LENGTH=500;
export const CHAT_MENTION_MAX_COUNT=8;

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

export function chatMessagePreview(value,maxLength=90){
  const text=cleanChatText(value,CHAT_MESSAGE_MAX_LENGTH).replace(/\s+/g,' ');
  return text.length<=maxLength?text:`${text.slice(0,Math.max(1,maxLength-1)).trimEnd()}…`;
}

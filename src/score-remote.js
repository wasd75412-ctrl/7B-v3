export const SCORE_REMOTE_ACTIONS=['teamAPlus','teamBPlus','undo','teamAMinus','teamBMinus'];
export const VIRTUAL_REMOTE_CLICK_CODE='VirtualClick';

export const DEFAULT_SCORE_REMOTE_BINDINGS={
  teamAPlus:'ArrowLeft',
  teamBPlus:'ArrowRight',
  undo:'ArrowDown',
  teamAMinus:'PageUp',
  teamBMinus:'PageDown'
};

export function normalizeRemoteBinding(value){
  const binding=String(value||'').trim();
  return binding&&binding.length<=64?binding:'';
}

export function normalizeRemoteBindings(source={}){
  return Object.fromEntries(SCORE_REMOTE_ACTIONS.map(action=>[
    action,
    Object.prototype.hasOwnProperty.call(source||{},action)?normalizeRemoteBinding(source[action]):DEFAULT_SCORE_REMOTE_BINDINGS[action]
  ]));
}

export function remoteEventCode(event={}){
  const code=normalizeRemoteBinding(event.code);
  if(code&&code!=='Unidentified')return code;
  if(event.key===' ')return'Space';
  const key=normalizeRemoteBinding(event.key);
  return key;
}

export function remoteActionForCode(bindings,code){
  const normalizedCode=normalizeRemoteBinding(code);
  if(!normalizedCode)return'';
  return SCORE_REMOTE_ACTIONS.find(action=>normalizeRemoteBinding(bindings?.[action])===normalizedCode)||'';
}

export function advanceRemotePressState(pressedCodes,code,phase='keydown',repeat=false){
  const next=new Set(pressedCodes||[]),normalizedCode=normalizeRemoteBinding(code);
  if(!normalizedCode)return{pressedCodes:next,shouldHandle:false};
  if(phase==='keyup'){
    const hadEarlierEvent=next.delete(normalizedCode);
    return{pressedCodes:next,shouldHandle:!hadEarlierEvent};
  }
  if(phase==='keydown'){
    next.add(normalizedCode);
    return{pressedCodes:next,shouldHandle:!repeat};
  }
  if(next.has(normalizedCode))return{pressedCodes:next,shouldHandle:false};
  next.add(normalizedCode);
  return{pressedCodes:next,shouldHandle:true};
}

export function assignRemoteBinding(bindings,action,code){
  if(!SCORE_REMOTE_ACTIONS.includes(action))return normalizeRemoteBindings(bindings);
  const next=normalizeRemoteBindings(bindings),normalizedCode=normalizeRemoteBinding(code);
  if(!normalizedCode)return next;
  for(const otherAction of SCORE_REMOTE_ACTIONS)if(otherAction!==action&&next[otherAction]===normalizedCode)next[otherAction]='';
  next[action]=normalizedCode;
  return next;
}

export function isEditableRemoteTarget(target){
  const tagName=String(target?.tagName||'').toUpperCase();
  return !!target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(tagName);
}

export function shouldHandleRemoteInput({enabled,isHost,scoreVisible,matchActive,matchFinished,repeat,editable}={}){
  return !!enabled&&!!isHost&&!!scoreVisible&&!!matchActive&&!matchFinished&&!repeat&&!editable;
}

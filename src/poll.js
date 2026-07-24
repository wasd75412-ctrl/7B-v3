export function pollWasFinalized(poll={}){
  return poll?.status==='closed'&&!(Array.isArray(poll?.options)&&poll.options.length);
}

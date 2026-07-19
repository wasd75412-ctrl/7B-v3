export function shouldShowNotificationPrompt({roomId,supported,enabled,alreadyAnswered,alreadyShown}){
  return !!roomId&&!!supported&&!enabled&&!alreadyAnswered&&!alreadyShown;
}

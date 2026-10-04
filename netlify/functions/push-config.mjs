import { jsonResponse, pushSettings } from './lib/push-shared.mjs';

export default async request=>{
  if(request.method!=='GET')return jsonResponse({error:'不支援這個操作。'},405);
  const push=pushSettings();
  if(!push)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  return jsonResponse({publicKey:push.publicKey});
};

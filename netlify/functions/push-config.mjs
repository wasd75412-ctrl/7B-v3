import { jsonResponse } from './lib/push-shared.mjs';

export default async request=>{
  if(request.method!=='GET')return jsonResponse({error:'不支援這個操作。'},405);
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim();
  if(!publicKey)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  return jsonResponse({publicKey});
};

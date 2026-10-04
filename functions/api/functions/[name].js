import chatMedia from '../../../netlify/functions/chat-media.mjs';
import chatMention from '../../../netlify/functions/chat-mention.mjs';
import eventAnnouncement from '../../../netlify/functions/event-announcement.mjs';
import packingReminder from '../../../netlify/functions/packing-reminder.mjs';
import pollDeadlineReminder from '../../../netlify/functions/poll-deadline-reminder.mjs';
import pushConfig from '../../../netlify/functions/push-config.mjs';
import pushHealth from '../../../netlify/functions/push-health.mjs';
import pushSubscription from '../../../netlify/functions/push-subscription.mjs';
import pushTest from '../../../netlify/functions/push-test.mjs';
import sessionFeeNotice from '../../../netlify/functions/session-fee-notice.mjs';
import weeklyPoll from '../../../netlify/functions/weekly-poll.mjs';

const handlers = {
  'chat-media': chatMedia,
  'chat-sync': chatMention,
  'chat-mention': chatMention,
  'device-check': pushTest,
  'device-link': pushSubscription,
  'event-announcement': eventAnnouncement,
  'notify-config': pushConfig,
  'notify-subscription': pushSubscription,
  'notify-test': pushTest,
  'notification-health': pushHealth,
  'packing-reminder': packingReminder,
  'poll-deadline-reminder': pollDeadlineReminder,
  'push-config': pushConfig,
  'push-health': pushHealth,
  'push-subscription': pushSubscription,
  'push-test': pushTest,
  'settings': pushConfig,
  'session-fee-notice': sessionFeeNotice,
  'weekly-poll': weeklyPoll
};

const CANONICAL_SITE_URL = 'https://7b-v3.pages.dev';

function httpsUrl(value){
  try{
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.href.replace(/\/$/, '') : '';
  }catch{return ''}
}

function cloudflareSiteUrl(env){
  for(const configured of [env?.SITE_URL, env?.PUBLIC_SITE_URL, env?.URL, env?.DEPLOY_PRIME_URL]){
    const url = httpsUrl(configured);
    if(url)return url;
  }
  if(typeof env?.CF_PAGES_URL === 'string'){
    try{
      const url = new URL(env.CF_PAGES_URL);
      if(url.hostname === '7b-v3.pages.dev' || url.hostname.endsWith('.7b-v3.pages.dev'))return CANONICAL_SITE_URL;
      return url.origin;
    }catch{}
  }
  return '';
}

function syncEnvironment(env){
  globalThis.__SEVEN_B_CLOUDFLARE_ENV__ = env;
  if(typeof process !== 'undefined'){
    process.env ||= {};
    for(const [key, value] of Object.entries(env || {})){
      if(typeof value === 'string')process.env[key] = value;
    }
    process.env.URL = cloudflareSiteUrl(env) || CANONICAL_SITE_URL;
    process.env.DEPLOY_PRIME_URL = process.env.URL;
  }
}

export async function onRequest(context){
  syncEnvironment(context.env);
  const name = context.params.name;
  const handler = handlers[name];
  if(!handler)return new Response(JSON.stringify({ error: '找不到這個功能。' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
  try{
    return await handler(context.request);
  }catch(error){
    console.error(`Function ${name} failed`, error);
    return new Response(JSON.stringify({ error: '服務暫時無法使用，請稍後再試。' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}

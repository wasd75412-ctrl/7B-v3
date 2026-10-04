import chatMedia from '../../../netlify/functions/chat-media.mjs';
import chatMention from '../../../netlify/functions/chat-mention.mjs';
import eventAnnouncement from '../../../netlify/functions/event-announcement.mjs';
import packingReminder from '../../../netlify/functions/packing-reminder.mjs';
import pollDeadlineReminder from '../../../netlify/functions/poll-deadline-reminder.mjs';
import pushConfig from '../../../netlify/functions/push-config.mjs';
import pushSubscription from '../../../netlify/functions/push-subscription.mjs';
import pushTest from '../../../netlify/functions/push-test.mjs';
import sessionFeeNotice from '../../../netlify/functions/session-fee-notice.mjs';
import weeklyPoll from '../../../netlify/functions/weekly-poll.mjs';

const handlers = {
  'chat-media': chatMedia,
  'chat-mention': chatMention,
  'event-announcement': eventAnnouncement,
  'packing-reminder': packingReminder,
  'poll-deadline-reminder': pollDeadlineReminder,
  'push-config': pushConfig,
  'push-subscription': pushSubscription,
  'push-test': pushTest,
  'session-fee-notice': sessionFeeNotice,
  'weekly-poll': weeklyPoll
};

const CANONICAL_SITE_URL = 'https://7b-v3.pages.dev';

function cloudflareSiteUrl(env){
  const configured = env?.SITE_URL || env?.PUBLIC_SITE_URL || env?.URL || env?.DEPLOY_PRIME_URL;
  if(typeof configured === 'string' && configured.trim())return configured.replace(/\/$/, '');
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
    process.env.URL = process.env.URL || cloudflareSiteUrl(env);
    process.env.DEPLOY_PRIME_URL = process.env.DEPLOY_PRIME_URL || process.env.URL;
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
  return handler(context.request);
}

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

function syncEnvironment(env){
  globalThis.__SEVEN_B_CLOUDFLARE_ENV__ = env;
  if(typeof process !== 'undefined'){
    process.env ||= {};
    for(const [key, value] of Object.entries(env || {})){
      if(typeof value === 'string')process.env[key] = value;
    }
    if(!process.env.URL && typeof env?.CF_PAGES_URL === 'string')process.env.URL = env.CF_PAGES_URL;
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

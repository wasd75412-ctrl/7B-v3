export const SCHEDULED_FUNCTIONS = ['weekly-poll', 'poll-deadline-reminder', 'packing-reminder'];

const DEFAULT_SITE_URL = 'https://7b-v3.pages.dev';

export async function runScheduledFunctions(env = {}, fetcher = fetch){
  const siteUrl = String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  return Promise.all(SCHEDULED_FUNCTIONS.map(async name => {
    try{
      const response = await fetcher(`${siteUrl}/api/functions/${name}`, { headers: { 'cache-control': 'no-cache' } });
      const body = (await response.text()).slice(0, 300);
      return { name, status: response.status, body };
    }catch(error){
      return { name, status: 0, body: String(error?.message || error) };
    }
  }));
}

export default {
  async scheduled(_event, env, ctx){
    ctx.waitUntil(runScheduledFunctions(env).then(results => {
      for(const result of results){
        const line = `${result.name} -> ${result.status} ${result.body}`;
        if(result.status === 200)console.log(line);
        else console.error(line);
      }
    }));
  }
};

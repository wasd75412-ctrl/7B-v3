const CACHE='7b-bcm-20260717-multiple-announcements-311';
const ASSETS=['./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./assets/7b-logo-full.png','./assets/fonts/jason-handwriting-9-brand.woff2?v=20260714-277'];

async function installAppShell(){
  const cache=await caches.open(CACHE);
  const indexResponse=await fetch('./index.html',{cache:'no-store'});
  if(!indexResponse.ok)throw new Error(`App shell ${indexResponse.status}`);
  const html=await indexResponse.clone().text();
  const versionAssets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)/gi)]
    .map(match=>new URL(match[1],self.registration.scope).href)
    .filter(url=>new URL(url).origin===self.location.origin);
  await cache.addAll([...new Set([...ASSETS,...versionAssets])]);
  await cache.put('./index.html',indexResponse.clone());
  await cache.put('./',indexResponse);
}

self.addEventListener('install',event=>event.waitUntil(installAppShell().then(()=>self.skipWaiting())));

self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin||event.request.url.includes('/.netlify/functions/'))return;
  const isNavigation=event.request.mode==='navigate',cacheKey=isNavigation?'./index.html':event.request;
  event.respondWith(fetch(event.request,{cache:isNavigation?'no-store':'default'}).then(response=>{
    if(response?.ok&&response.type==='basic'){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(cacheKey,copy)).catch(()=>{});
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(cacheKey);
    if(cached)return cached;
    if(isNavigation){const fallback=await caches.match('./index.html');if(fallback)return fallback}
    return Response.error();
  }));
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||''}}
  event.waitUntil(self.registration.showNotification(data.title||'🔥投票明日截止🔥',{
    body:data.body||'還沒投票的球友們，點一下進行投票🏸',
    icon:data.icon||'./icons/icon-192.png',
    badge:data.badge||'./icons/icon-192.png',
    tag:data.tag||'7b-poll-reminder',
    renotify:true,
    data:{url:data.url||'./'}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){if('navigate'in client)await client.navigate(target);return client.focus()}
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  }));
});

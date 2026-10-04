import { getStore as getNetlifyStore } from '@netlify/blobs';

const CLOUDFLARE_KV_BINDINGS = ['SEVEN_B_BLOBS', 'NETLIFY_BLOBS', 'BLOBS', 'KV'];

function cloudflareEnv(){
  return globalThis.__SEVEN_B_CLOUDFLARE_ENV__ || null;
}

function cloudflareNamespace(){
  const env = cloudflareEnv();
  if(!env)return null;
  for(const name of CLOUDFLARE_KV_BINDINGS){
    const namespace = env[name];
    if(namespace && typeof namespace.get === 'function' && typeof namespace.put === 'function')return namespace;
  }
  return null;
}

function cloudflareKey(storeName, key){
  return `${storeName}/${key}`;
}

function cloudflareStore({ name }){
  const namespace = cloudflareNamespace();
  if(!namespace)return null;
  const storeName = String(name || 'default');
  return {
    async list(options = {}){
      const prefix = cloudflareKey(storeName, options.prefix || '');
      const listing = await namespace.list({ prefix });
      return {
        blobs: (listing.keys || []).map(item => ({
          key: item.name.slice(`${storeName}/`.length),
          metadata: item.metadata || {}
        }))
      };
    },
    async get(key, options = {}){
      const type = options.type === 'json' ? 'json' : options.type === 'arrayBuffer' ? 'arrayBuffer' : 'text';
      return namespace.get(cloudflareKey(storeName, key), type);
    },
    async getMetadata(key){
      const item = await namespace.getWithMetadata(cloudflareKey(storeName, key), { type: 'stream' });
      if(!item.value)return null;
      return { metadata: item.metadata || {} };
    },
    async getWithMetadata(key, options = {}){
      const type = options.type === 'json' ? 'json' : options.type === 'arrayBuffer' ? 'arrayBuffer' : 'text';
      const item = await namespace.getWithMetadata(cloudflareKey(storeName, key), { type });
      if(item.value === null)return null;
      return { data: item.value, metadata: item.metadata || {} };
    },
    async set(key, value, options = {}){
      const storedKey = cloudflareKey(storeName, key);
      if(options.onlyIfNew && await namespace.get(storedKey, 'stream'))throw new Error(`Blob already exists: ${key}`);
      await namespace.put(storedKey, value, { metadata: options.metadata || {} });
    },
    async setJSON(key, value, options = {}){
      await this.set(key, JSON.stringify(value), {
        ...options,
        metadata: {
          ...(options.metadata || {}),
          contentType: 'application/json'
        }
      });
    },
    async delete(key){
      await namespace.delete(cloudflareKey(storeName, key));
    }
  };
}

export function getBlobStore(options){
  const store = cloudflareStore(options);
  if(store)return store;
  if(cloudflareEnv())throw new Error('Cloudflare KV binding SEVEN_B_BLOBS is not available.');
  return getNetlifyStore(options);
}

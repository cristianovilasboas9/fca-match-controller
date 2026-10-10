/* Service worker of stories.html — keeps the story composer usable with no network at the pitch.

   Registered with scope "./stories": it controls stories.html and stories/*, never index.html.
   It needs no edit when the page or the kit changes:
     - stories.html and stories/kit.js   network first (4 s), cached copy when the network is gone
     - stories/fonts/*                   cached copy at once, refreshed in the background
     - every other stories/* file        cache first. The page asks for them as file?v=<kit version>,
                                         so a rebuilt kit has new URLs and old ones are pruned on request. */
const CACHE = 'fca-stories-v1';
const SHELL = ['stories.html', 'stories/kit.js', 'stories/fonts/Portugal2025.otf', 'stories/fonts/Inter.woff2', 'stories/fonts/Oswald.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const keep = async (req, res) => {
  if (res && res.ok && res.type === 'basic') (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

async function networkFirst(key) {
  const cached = await caches.match(key);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), cached ? 4000 : 20000);   // a dying stadium network must not hang the page
    const res = await fetch(key, { cache: 'no-cache', signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok && cached) return cached;
    return keep(key, res);
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
async function cacheFirst(req) {
  return (await caches.match(req)) || keep(req, await fetch(req));
}
async function staleWhileRevalidate(req) {
  const cached = await caches.match(req), fresh = fetch(req).then((res) => keep(req, res));
  if (!cached) return fresh;
  fresh.catch(() => {});
  return cached;
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.endsWith('/stories.html') || path.endsWith('/stories/kit.js')) e.respondWith(networkFirst(url.origin + path));
  else if (path.includes('/stories/fonts/')) e.respondWith(staleWhileRevalidate(req));
  else if (path.includes('/stories/')) e.respondWith(cacheFirst(req));
});

// the page tells which kit version it runs: files of older kits are dropped
self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'prune' || !d.keep) return;
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const req of await c.keys()) {
      const v = new URL(req.url).searchParams.get('v');
      if (v && v !== d.keep) await c.delete(req);
    }
  }));
});

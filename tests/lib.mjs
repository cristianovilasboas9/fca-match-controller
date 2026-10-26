/* Shared rig for the Match Controller Playwright tests.
 *
 *  - static server for any checkout of the app (worktree, or a snapshot of main)
 *  - hermetic network: every external request is intercepted and answered from
 *    a local fixture cache (tests/.cache, filled on first use from the live
 *    site), through a NETWORK PROFILE that can delay, abort or stall requests
 *  - in-page PNG analysis (size, opacity, "is it mostly empty")
 *
 * Usage: node tests/<script>.mjs   (no npm install: Playwright is borrowed from
 * the club site repo, see PLAYWRIGHT below).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PLAYWRIGHT = process.env.MC_PLAYWRIGHT
  || '/Users/cristiano/Business/fc-atlantic-vevey/node_modules/playwright/index.mjs';
export const { chromium, webkit, devices } = await import(PLAYWRIGHT);

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TESTS_DIR, '..');
export const CACHE_DIR = process.env.MC_FIXTURES || path.join(TESTS_DIR, '.cache');
export const OUT_DIR = path.join(TESTS_DIR, 'out');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

export const ENGINES = { chromium, webkit };
export const IPHONE = devices['iPhone 14'];

/* ---------- seeded RNG (mulberry32) ---------- */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

/* ---------- static server ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
export function startServer(rootDir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = path.join(rootDir, p);
      if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${srv.address().port}/`,
      close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(() => r()); }),
    }));
  });
}

/* ---------- fixture cache ---------- */
const memo = new Map();
async function fixture(url) {
  if (memo.has(url)) return memo.get(url);
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const metaFile = path.join(CACHE_DIR, key + '.json');
  const bodyFile = path.join(CACHE_DIR, key + '.bin');
  let fx;
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    fx = { ...meta, body: meta.status === 200 ? fs.readFileSync(bodyFile) : Buffer.alloc(0) };
  } else {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const body = Buffer.from(await r.arrayBuffer());
      const meta = { url, status: r.status, contentType: r.headers.get('content-type') || 'application/octet-stream' };
      fs.writeFileSync(metaFile, JSON.stringify(meta));
      if (r.status === 200) fs.writeFileSync(bodyFile, body);
      fx = { ...meta, body };
    } catch (e) {
      fx = { url, status: 0, contentType: '', body: Buffer.alloc(0), error: String(e) };
    }
  }
  memo.set(url, fx);
  return fx;
}

export function classify(url) {
  if (url.includes('/api/match-controller/bundle')) return 'bundle';
  if (url.includes('html2canvas')) return 'lib';
  if (url.includes('images.weserv.nl')) return 'proxy';
  if (url.includes('/players/cutout/')) return 'cutout';
  if (url.includes('/players/')) return 'photo';
  if (url.includes('/logos/clubs/')) return 'crest';
  if (url.includes('/decors/')) return 'scene';
  if (url.includes('/logos/sponsors') || url.includes('supabase.co')) return 'sponsor';
  return 'other';
}

/* ---------- network profiles ----------
   A profile is a function (info, rnd) -> { type:'ok'|'abort'|'stall'|'delay', ms? }
   info = { url, kind, resourceType ('fetch'|'image'|'script'|…), inClone (request
   issued by a frame other than the main one = html2canvas' document clone) }. */
export const PROFILES = {
  /* Fast and healthy. */
  ok: () => ({ type: 'ok' }),
  /* Mobile data at the pitch: everything answers, slowly. */
  slow: (info, rnd) => (info.kind === 'bundle' || info.kind === 'lib')
    ? { type: 'delay', ms: 200 + rnd.int(600) }
    : { type: 'delay', ms: 250 + rnd.int(2200) },
  /* Flaky cell: some assets fail, some never answer, the rest is slow. */
  flaky: (info, rnd) => {
    if (info.kind === 'bundle' || info.kind === 'lib') return { type: 'delay', ms: 150 + rnd.int(400) };
    const x = rnd();
    if (x < 0.14) return { type: 'abort' };
    if (x < 0.26) return { type: 'stall' };
    return { type: 'delay', ms: 100 + rnd.int(1500) };
  },
  /* The app's own fetch() calls are healthy (every poster asset ends up in the
     dataURL caches) but <img> elements — i.e. the thumbnails of the control
     panel — never get an answer. Isolates what the export really depends on. */
  imgStall: (info) => (info.resourceType === 'image' && info.kind !== 'lib') ? { type: 'stall' } : { type: 'ok' },
};

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=0, must-revalidate' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Installs the hermetic network on a page. Returns a controller:
     net.profile = fn      swap the profile at any time
     net.log               every intercepted request ({ url, kind, resourceType, inClone, verdict, t })
     net.block(kind)       abort every request of that kind until net.unblock(kind) */
export async function installNetwork(page, profile, rnd, appOrigin) {
  const net = { profile, log: [], blocked: new Set(), stalled: 0,
    block(k) { this.blocked.add(k); }, unblock(k) { this.blocked.delete(k); } };
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(appOrigin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue().catch(() => {});
    const kind = classify(url);
    let inClone = false;
    try { inClone = req.frame() !== page.mainFrame(); } catch (e) { /* frame gone */ }
    const info = { url, kind, resourceType: req.resourceType(), inClone };
    let verdict = net.blocked.has(kind) ? { type: 'abort' } : net.profile(info, rnd);
    const entry = { ...info, verdict: verdict.type, t: Date.now() };
    net.log.push(entry);
    try {
      if (verdict.type === 'abort') return await route.abort('failed');
      /* never answered (unref: a stalled request must not keep the test process alive) */
      if (verdict.type === 'stall') { net.stalled++; await new Promise(r => setTimeout(r, 180000).unref()); return await route.abort('timedout'); }
      if (verdict.type === 'delay') await sleep(verdict.ms);
      /* The proxy answers with whatever the origin would have served. */
      let target = url;
      if (kind === 'proxy') {
        const inner = new URL(url).searchParams.get('url') || '';
        target = 'https://' + inner.replace(/^https?:\/\//, '');
      }
      const fx = await fixture(target);
      if (fx.status !== 200) return await route.fulfill({ status: fx.status || 502, headers: CORS, body: '' });
      await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': fx.contentType }, body: fx.body });
    } catch (e) { /* page closed / navigation: the request died with it */ }
  });
  return net;
}

/* ---------- app helpers ---------- */
export async function openApp(engineName, appUrl, { profile = PROFILES.ok, seed = 1, device = IPHONE, storageState, waitBoot = true } = {}) {
  const browser = await ENGINES[engineName].launch();
  const { defaultBrowserType, ...dev } = device;
  const context = await browser.newContext({ ...dev, storageState });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: String(e && e.message || e), t: Date.now() }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console', msg: m.text().slice(0, 300), t: Date.now() }); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const net = await installNetwork(page, profile, rng(seed ^ 0x9e3779b9), new URL(appUrl).origin);
  if (waitBoot) {
    await page.goto(appUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#poster-root #poster-node'), null, { timeout: 30000 });
  } else {
    await page.goto(appUrl, { waitUntil: 'commit' });
  }
  return { browser, context, page, net, errors, close: () => browser.close() };
}

/* Decodes a PNG blob URL (or data URL) inside the page and measures it.
   blank   = nothing was painted: transparent pixels, or one flat colour
   partial = a horizontal slice of the poster is transparent or perfectly flat
             (every poster paints a radial night-blue gradient edge to edge, so
             a flat slice means the renderer stopped before reaching it) */
export async function analyzePng(page, src) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('PNG illisible')); });
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const STEP = 4, SLICES = 6;
    const sl = Array.from({ length: SLICES }, () => ({ n: 0, tr: 0, sum: 0, sum2: 0, ink: 0 }));
    for (let y = 0; y < h; y += STEP) {
      const s = sl[Math.min(SLICES - 1, Math.floor(y / (h / SLICES)))];
      for (let x = 0; x < w; x += STEP) {
        const i = (y * w + x) * 4;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        s.n++;
        if (d[i + 3] < 250) s.tr++;
        s.sum += lum; s.sum2 += lum * lum;
        if (lum > 110) s.ink++;
      }
    }
    c.width = c.height = 0;
    const n = sl.reduce((a, s) => a + s.n, 0);
    const sum = sl.reduce((a, s) => a + s.sum, 0), sum2 = sl.reduce((a, s) => a + s.sum2, 0);
    const transparent = sl.reduce((a, s) => a + s.tr, 0) / n;
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const ink = sl.reduce((a, s) => a + s.ink, 0) / n;
    const sliceStd = sl.map(s => Math.sqrt(Math.max(0, s.sum2 / s.n - (s.sum / s.n) ** 2)));
    const blank = transparent > 0.02 || std < 6 || ink < 0.002;
    const partial = !blank && sl.some((s, i) => s.tr / s.n > 0.02 || sliceStd[i] < 1.2);
    return { w, h, transparent: +transparent.toFixed(4), std: +std.toFixed(1), ink: +ink.toFixed(4),
      sliceStd: sliceStd.map(v => +v.toFixed(1)), blank, partial };
  }, src);
}

/* Exports through the REAL user path: tap on the card, wait for the drawer to
   show the PNG, or for the failure toast, or give up (hang).
   → { status:'ok'|'error'|'hang'|'dead', ms, png?, message? } */
export async function exportViaTap(page, { timeout = 52000, save } = {}) {
  const t0 = Date.now();
  await page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.className = 'toast'; window.scrollTo(0, 0); });
  await page.locator('#preview-tap').tap({ position: { x: 60, y: 60 } });
  const opened = await page.waitForSelector('#poster-overlay', { timeout: 3000 }).then(() => true, () => false);
  if (!opened) {
    const toastNow = await page.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('show') ? t.textContent : ''; });
    return { status: toastNow ? 'error' : 'dead', ms: Date.now() - t0, message: toastNow || 'tap sans effet (aucun tiroir, aucun message)' };
  }
  const outcome = await page.waitForFunction(() => {
    const im = document.querySelector('#poster-overlay #overlay-body img');
    if (im && im.complete && im.naturalWidth > 0) return { ok: true, src: im.src };
    const failed = document.querySelector('#poster-overlay [data-export-error]');
    if (failed) return { ok: false, message: failed.textContent };
    if (!document.getElementById('poster-overlay')) {
      const t = document.getElementById('toast');
      return { ok: false, message: t.textContent || '(tiroir fermé sans message)' };
    }
    return false;
  }, null, { timeout, polling: 150 }).then(h => h.jsonValue(), () => null);
  const ms = Date.now() - t0;
  if (!outcome) {
    await page.evaluate(() => { const b = document.querySelector('#overlay-close'); if (b) b.click(); });
    return { status: 'hang', ms, message: `aucun résultat après ${Math.round(ms / 1000)} s` };
  }
  if (!outcome.ok) {
    await page.evaluate(() => { const b = document.querySelector('#overlay-close'); if (b) b.click(); });
    return { status: 'error', ms, message: outcome.message };
  }
  const png = await analyzePng(page, outcome.src);
  if (save) {
    const b64 = await page.evaluate(async (src) => {
      const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, outcome.src);
    fs.mkdirSync(path.dirname(save), { recursive: true });
    fs.writeFileSync(save, Buffer.from(b64, 'base64'));
  }
  await page.locator('#overlay-close').tap();
  await page.waitForSelector('#poster-overlay', { state: 'detached', timeout: 3000 }).catch(() => {});
  return { status: 'ok', ms, png };
}

/* Direct export (no UI): returns the PNG bytes of the current poster. */
export async function exportDirect(page, save) {
  const b64 = await page.evaluate(async () => {
    const { blob } = await window.__mc.buildPosterBlob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const bytes = Buffer.from(b64, 'base64');
  if (save) { fs.mkdirSync(path.dirname(save), { recursive: true }); fs.writeFileSync(save, bytes); }
  return bytes;
}

export const expectedSize = (variant, format) =>
  (format === 'post' && (variant === 'matchday' || variant === 'recap')) ? { w: 1080, h: 1350 } : { w: 1080, h: 1920 };

export { sleep };

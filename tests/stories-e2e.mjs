// End-to-end test of stories.html on Chromium AND WebKit, iPhone viewport + touch.
//
//   node tests/stories-e2e.mjs [--only chromium|webkit] [--photos DIR] [--kit DIR]
//
// It serves the repo itself (no other server needed), drives the page like a thumb would (taps, one-finger
// drags, two-finger pinches; mouse and wheel too) and judges the EXPORTED FILE, never the preview:
//   - 1080x1920, photo in the right window, bands in night navy, mask on top — compared with a reference
//     composed here from the ORIGINAL photo and the ORIGINAL mask PNG of the club kit;
//   - stickers found in the export where the fingers left them, at the size they were pinched to.
// The exports land in validation-stories/ (to be LOOKED at), the UI screenshots next to them.
//
// Touch: Chromium receives real touch input (DevTools protocol). WebKit has no such channel in Playwright,
// its fingers are synthetic PointerEvents: the page's logic is covered, Safari's own touch delivery is not.
import { chromium, webkit, devices } from '/Users/cristiano/Business/fc-atlantic-vevey/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = arg('photos', path.join(homedir(), 'Business/STUDIO_MARKETING_IA/projects/fca/masques-instagram-2627/assets/photos'));
const KIT = arg('kit', path.join(homedir(), 'Desktop/MASKFCA'));
const ONLY = arg('only', '');
const OUT = path.join(ROOT, 'validation-stories');
const TMP = path.join(tmpdir(), 'fca-stories-e2e');
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

/* ---------- static server: the repo + the originals used as references ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>blank</title>'); return; }
    const file = p.startsWith('/__photos/') ? path.join(PHOTOS, path.basename(p)) : p.startsWith('/__tmp/') ? path.join(TMP, path.basename(p))
      : p.startsWith('/__kit/') ? path.join(KIT, p.slice(7)) : path.join(ROOT, p);
    if (!file.startsWith(ROOT) && !file.startsWith(PHOTOS) && !file.startsWith(TMP) && !file.startsWith(KIT)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port, BASE = 'http://localhost:' + PORT;
// "the network is gone" = the server really stops answering (Playwright's own offline switch makes WebKit
// fail every load before the service worker is even asked, so it cannot show what a phone would do)
const networkDown = () => new Promise((r) => { server.close(r); server.closeAllConnections(); });
const networkUp = () => new Promise((r) => server.listen(PORT, r));

/* ---------- small helpers ---------- */
let passed = 0, failed = 0, engineName = '';
function check(ok, label, detail = '') {
  if (ok) passed++; else { failed++; console.log(`   FAIL [${engineName}] ${label}${detail ? ' — ' + detail : ''}`); }
  return ok;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function jpegSize(buf) {   // dimensions straight from the file's SOF marker
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
const pngSize = (buf) => (buf.readUInt32BE(0) === 0x89504E47 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);
function withExifOrientation(jpeg, o) {   // an Exif APP1 holding only the Orientation tag, right after JFIF
  const tiff = Buffer.from([0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0, 0, 0, 0, 0]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  const at = jpeg[2] === 0xFF && jpeg[3] === 0xE0 ? 4 + jpeg.readUInt16BE(4) : 2;
  return Buffer.concat([jpeg.subarray(0, at), app1, jpeg.subarray(at)]);
}

// The three windows, restated from the brief (NOT read from the page): x 0-1080 always.
const WINDOWS = { '9x16': { y: 0, h: 1920, kit: '9x16' }, '1x1': { y: 420, h: 1080, kit: 'carree' }, '16x9': { y: 656, h: 608, kit: '16x9' } };

/* ---------- in-page toolbox (pixels) ---------- */
function toolbox() {
  const load = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('cannot load ' + url)); im.src = url; });
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const t = window.__t = {
    load,
    async b64(blob) { const b = new Uint8Array(await new Response(blob).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
    async pixelsOf(src) {   // Blob, URL or canvas -> ImageData
      let im = src, w, h, url = null;
      if (src instanceof Blob) { url = URL.createObjectURL(src); im = await load(url); }
      else if (typeof src === 'string') im = await load(src);
      w = im.naturalWidth || im.width; h = im.naturalHeight || im.height;
      const c = cv(w, h), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      if (url) URL.revokeObjectURL(url);
      return g.getImageData(0, 0, w, h);
    },
    rendered() {   // the story as the page draws it for export, before any JPEG
      const c = cv(1080, 1920), g = c.getContext('2d', { willReadFrequently: true });
      window.__stories.renderStory(g, true);
      return g.getImageData(0, 0, 1080, 1920);
    },
    // the brief, composed independently: navy, photo covering its window, original mask PNG on top
    async reference({ photo, mask, win }) {
      const c = cv(1080, 1920), g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#04080F'; g.fillRect(0, 0, 1080, 1920);
      const im = await load(photo), k = Math.max(1080 / im.naturalWidth, win.h / im.naturalHeight);
      g.save(); g.beginPath(); g.rect(0, win.y, 1080, win.h); g.clip();
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, (1080 - im.naturalWidth * k) / 2, win.y + (win.h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      g.restore();
      if (mask) g.drawImage(await load(mask), 0, 0);
      return g.getImageData(0, 0, 1080, 1920);
    },
    // mean absolute difference, overall and for the worst 60x60 block (a wrong region cannot hide in the average)
    compare(a, b, region) {
      const W = a.width, r = region || { x: 0, y: 0, w: a.width, h: a.height }, B = 60;
      let sum = 0, n = 0, worst = 0, at = null;
      for (let by = r.y; by < r.y + r.h; by += B) for (let bx = r.x; bx < r.x + r.w; bx += B) {
        let s = 0, m = 0;
        for (let y = by; y < Math.min(by + B, r.y + r.h); y++) for (let x = bx; x < Math.min(bx + B, r.x + r.w); x++) {
          const i = (y * W + x) * 4;
          s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); m += 3;
        }
        sum += s; n += m;
        if (m && s / m > worst) { worst = s / m; at = [bx, by]; }
      }
      return { mean: sum / n, worst, at };
    },
    // Where two renders differ, looked at sticker by sticker. Each item is the sticker's solid box
    // { cx, cy, w, h, r }: the changed pixels are measured in that box's own (rotated) frame.
    changes(a, b, items, pad = 70, thr = 30) {
      const W = a.width, H = a.height, hit = new Uint8Array(W * H), claimed = new Uint8Array(W * H);
      for (let i = 0, p = 0; p < W * H; i += 4, p++) if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > thr) hit[p] = 1;
      const out = items.map((it) => {
        const c = Math.cos(-it.r), s = Math.sin(-it.r), hw = it.w / 2 + pad, hh = it.h / 2 + pad, R = Math.hypot(hw, hh);
        let n = 0, sx = 0, sy = 0, l = Infinity, r = -Infinity, t = Infinity, d = -Infinity;
        for (let y = Math.max(0, Math.floor(it.cy - R)); y < Math.min(H, Math.ceil(it.cy + R)); y++) for (let x = Math.max(0, Math.floor(it.cx - R)); x < Math.min(W, Math.ceil(it.cx + R)); x++) {
          const dx = x - it.cx, dy = y - it.cy, lx = dx * c - dy * s, ly = dx * s + dy * c;
          if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue;
          claimed[y * W + x] = 1;
          if (hit[y * W + x]) { n++; sx += x; sy += y; if (lx < l) l = lx; if (lx > r) r = lx; if (ly < t) t = ly; if (ly > d) d = ly; }
        }
        return { n, cx: n ? sx / n : -1, cy: n ? sy / n : -1, w: r - l, h: d - t, offx: (l + r) / 2, offy: (t + d) / 2 };
      });
      let stray = 0;
      for (let p = 0; p < W * H; p++) if (hit[p] && !claimed[p]) stray++;
      return { items: out, stray };
    },
    meanColor(img, r) { let s = [0, 0, 0], n = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = (y * img.width + x) * 4; s[0] += img.data[i]; s[1] += img.data[i + 1]; s[2] += img.data[i + 2]; n++; } return s.map((v) => v / n); },
    // mean difference between the export and a mask, over the pixels where the mask is fully opaque / fully clear
    async maskAgreement(exported, maskUrl, win) {
      const m = await t.pixelsOf(maskUrl);
      let so = 0, no = 0;
      for (let y = win.y; y < win.y + win.h; y++) for (let x = 0; x < 1080; x++) {
        const i = (y * 1080 + x) * 4;
        if (m.data[i + 3] === 255) { so += Math.abs(exported.data[i] - m.data[i]) + Math.abs(exported.data[i + 1] - m.data[i + 1]) + Math.abs(exported.data[i + 2] - m.data[i + 2]); no += 3; }
      }
      return { opaqueInWindow: no / 3, diff: no ? so / no : -1 };
    },
  };
}

/* ---------- fixtures made once with Chromium: a square photo, an EXIF-rotated one, a 48 MP one ---------- */
async function makeFixtures() {
  const b = await chromium.launch(), page = await b.newPage();
  await page.goto(BASE + '/__blank');
  const make = (src, op) => page.evaluate(async ({ src, op }) => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement('canvas'), g = c.getContext('2d');
    if (op === 'square') { const s = Math.min(w, h); c.width = c.height = s; g.drawImage(im, (s - w) / 2, (s - h) / 2); }
    else if (op === 'ccw') { c.width = h; c.height = w; g.translate(0, w); g.rotate(-Math.PI / 2); g.drawImage(im, 0, 0); }   // stored lying on its side
    else if (op === 'big') { c.width = 8064; c.height = 6048; g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, 8064, 6048); }
    return c.toDataURL('image/jpeg', op === 'big' ? 0.85 : 0.95).split(',')[1];
  }, { src, op });
  await writeFile(path.join(TMP, 'square.jpg'), Buffer.from(await make('/__photos/KURDE_2242.jpg', 'square'), 'base64'));
  // orientation 6 = "turn me a quarter clockwise to see me upright": what an iPhone held upright writes
  await writeFile(path.join(TMP, 'exif6.jpg'), withExifOrientation(Buffer.from(await make('/__photos/vertical-KURDE_1184.jpg', 'ccw'), 'base64'), 6));
  await writeFile(path.join(TMP, 'big48.jpg'), Buffer.from(await make('/__photos/groupe-celebration.jpg', 'big'), 'base64'));
  await writeFile(path.join(TMP, 'broken.jpg'), 'this is not a photo');
  await b.close();
}

/* ---------- one phone ---------- */
const IPHONE = devices['iPhone 14'];
async function phone(engine, { share = 'stub', sw = 'block', viewport } = {}) {
  const opts = engine === webkit ? { ...IPHONE } : { viewport: IPHONE.viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: IPHONE.userAgent };
  const ctx = await engine.launch().then((b) => b.newContext({ ...opts, ...(viewport ? { viewport } : {}), serviceWorkers: sw, acceptDownloads: true }));
  await ctx.addInitScript(toolbox);
  await ctx.addInitScript((share) => {
    window.__shared = [];
    const def = (name, value) => Object.defineProperty(Navigator.prototype, name, { configurable: true, writable: true, value });
    if (share === 'none') { def('share', undefined); def('canShare', undefined); return; }
    // records what the page hands to the share sheet, and whether the tap was still "fresh" at that moment
    def('share', (data) => {
      window.__shared.push({ files: data && data.files, keys: Object.keys(data || {}), fresh: navigator.userActivation ? navigator.userActivation.isActive : null });
      return window.__shareFails ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : Promise.resolve();
    });
    def('canShare', (d) => !!(d && d.files && d.files.length));
  }, share);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|blocked by Playwright/.test(m.text())) errors.push('console: ' + m.text()); });
  const open = async () => { await page.goto(BASE + '/stories.html'); await page.evaluate(() => window.__stories.ready); await page.waitForTimeout(150); };
  await open();

  /* fingers: frames of points in STORY coordinates */
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
  let down = new Map();
  async function fingers(points) {
    const pts = await page.evaluate((points) => { const r = document.querySelector('#story').getBoundingClientRect(); return points.map((p) => ({ id: p.id || 0, x: r.left + p.x * r.width / 1080, y: r.top + p.y * r.height / 1920 })); }, points);
    if (cdp) {
      const fresh = pts.some((p) => !down.has(p.id));
      await cdp.send('Input.dispatchTouchEvent', { type: !pts.length ? 'touchEnd' : fresh ? 'touchStart' : 'touchMove', touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
    } else {
      await page.evaluate(({ pts, prev }) => {
        const el = document.querySelector('#story');
        const fire = (type, p) => el.dispatchEvent(new PointerEvent(type, { pointerId: 100 + p.id, pointerType: 'touch', isPrimary: p.id === 0, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
        for (const p of pts) { const was = prev[p.id]; if (!was) fire('pointerdown', p); else if (was.x !== p.x || was.y !== p.y) fire('pointermove', p); }
        for (const id of Object.keys(prev)) if (!pts.some((p) => p.id === +id)) fire('pointerup', { id: +id, ...prev[id] });
      }, { pts, prev: Object.fromEntries(down) });
    }
    down = new Map(pts.map((p) => [p.id, { x: p.x, y: p.y }]));
    await page.waitForTimeout(12);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  async function drag(from, to, { steps = 8, hold = false } = {}) {
    await fingers([{ id: 0, ...from }]);
    for (let i = 1; i <= steps; i++) await fingers([{ id: 0, x: lerp(from.x, to.x, i / steps), y: lerp(from.y, to.y, i / steps) }]);
    if (!hold) await fingers([]);
  }
  // two fingers around a centre: spread from d0 to d1 (story px between fingers), turn from a0 to a1 (radians)
  async function pinch(c, d0, d1, a0 = 0, a1 = 0, { steps = 10, c2 = c } = {}) {
    const at = (t) => { const d = lerp(d0, d1, t) / 2, a = lerp(a0, a1, t), x = lerp(c.x, c2.x, t), y = lerp(c.y, c2.y, t); return [{ id: 0, x: x - d * Math.cos(a), y: y - d * Math.sin(a) }, { id: 1, x: x + d * Math.cos(a), y: y + d * Math.sin(a) }]; };
    await fingers([at(0)[0]]);
    await fingers(at(0));
    for (let i = 1; i <= steps; i++) await fingers(at(i / steps));
    await fingers([]);
  }
  const S = (fn, a) => page.evaluate(fn, a);
  const state = () => S(() => JSON.parse(JSON.stringify(window.__stories.state)));
  const toastSays = (text) => page.waitForFunction((text) => { const t = document.querySelector('#toast'); return t.classList.contains('show') && t.textContent.includes(text); }, text, { timeout: 5000 }).then(() => true, () => false);
  async function setPhoto(file) {
    await S(() => { window.__photoWas = window.__stories.rt.photo; });
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => window.__stories.rt.photo && window.__stories.rt.photo !== window.__photoWas && document.querySelector('#busy').hidden, null, { timeout: 60000 });
  }
  async function setMask(mask) {
    await page.tap(`#seg-mask [data-mask="${mask}"]`);
    await page.waitForFunction((mask) => { const s = window.__stories; return s.state.mask === mask && (mask === 'none' ? !s.rt.mask : !!s.rt.mask); }, mask, { timeout: 15000 });
  }
  // tap Exporter, take what reached the share sheet, close the export sheet
  async function exportViaShare({ keepOpen = false } = {}) {
    const before = await S(() => window.__shared.length);
    await page.tap('#btn-export');
    await page.waitForFunction((n) => window.__shared.length > n, before, { timeout: 15000 });
    const meta = await S(async () => { const s = window.__shared[window.__shared.length - 1], f = s.files[0]; return { name: f.name, type: f.type, keys: s.keys, fresh: s.fresh, count: s.files.length, b64: await window.__t.b64(f) }; });
    if (!keepOpen) await closeSheet();
    return { ...meta, buf: Buffer.from(meta.b64, 'base64') };
  }
  async function closeSheet() {
    await page.tap('.sheet.on [data-close]');
    await page.waitForFunction(() => !document.querySelector('.sheet.on'));
    await page.waitForTimeout(300);
  }
  async function addFromSheet(tab, pick) {   // open the sheet, go to a tab, run pick(), wait for the new sticker
    const n = (await state()).stickers.length;
    await page.tap('#btn-stickers');
    await page.tap(`#tabs [data-tab="${tab}"]`);
    await pick();
    await page.waitForFunction((n) => window.__stories.state.stickers.length === n + 1 && !document.querySelector('.sheet.on'), n, { timeout: 15000 });
    await page.waitForTimeout(300);
    return (await state()).stickers[n];
  }
  // where a sticker's solid part should be in the story: centre, size and angle, from its transform and ink box
  const inkBox = (id) => S((id) => {
    const s = window.__stories, st = s.state.stickers.find((x) => x.id === id), g = s.rt.gfx.get(id), c = Math.cos(st.r), n = Math.sin(st.r);
    const dx = ((g.ink.x0 + g.ink.x1) / 2 - g.w0 / 2) * st.s, dy = ((g.ink.y0 + g.ink.y1) / 2 - g.h0 / 2) * st.s;
    return { cx: st.x + dx * c - dy * n, cy: st.y + dx * n + dy * c, w: (g.ink.x1 - g.ink.x0) * st.s, h: (g.ink.y1 - g.ink.y0) * st.s, r: st.r };
  }, id);
  const client = (x, y) => S(({ x, y }) => { const r = document.querySelector('#story').getBoundingClientRect(); return [r.left + x * r.width / 1080, r.top + y * r.height / 1920]; }, { x, y });
  // mouse wheel over a story point. Playwright refuses the wheel on mobile WebKit: there the event is dispatched by hand.
  async function wheel(x, y, dy, shift = false) {
    const [cx, cy] = await client(x, y);
    await page.mouse.move(cx, cy);
    if (shift) await page.keyboard.down('Shift');
    try { await page.mouse.wheel(0, dy); }
    catch (_) { await S(({ cx, cy, dy, shift }) => document.querySelector('#story').dispatchEvent(new WheelEvent('wheel', { clientX: cx, clientY: cy, deltaY: dy, shiftKey: shift, bubbles: true, cancelable: true })), { cx, cy, dy, shift }); }
    finally { if (shift) await page.keyboard.up('Shift'); }
    await page.waitForTimeout(260);
  }
  return { ctx, page, errors, open, fingers, drag, pinch, wheel, client, S, state, toastSays, setPhoto, setMask, exportViaShare, closeSheet, addFromSheet, inkBox, close: () => ctx.browser().close() };
}

/* ====================================================================================================== */
async function run(name, engine) {
  engineName = name;
  const t0 = Date.now();
  const p = await phone(engine);
  const { page, S } = p;
  const save = (file, buf) => writeFile(path.join(OUT, `${name}-${file}`), buf);
  const shot = (file) => page.screenshot({ path: path.join(OUT, `ui-${name}-${file}.png`) });

  /* --- 1. the page itself --- */
  const boot = await S(() => ({
    title: document.title, back: document.querySelector('a.back').getAttribute('href'), backText: document.querySelector('a.back').textContent.trim(),
    canvas: [document.querySelector('#story').width, document.querySelector('#story').height], font: document.fonts.check('40px "Portugal2025"'),
    pick: !document.querySelector('#pick').hidden, disabled: document.querySelector('#btn-export').getAttribute('aria-disabled'),
    externals: [...document.querySelectorAll('script[src],link[href],img[src]')].map((e) => e.src || e.href).filter((u) => !u.startsWith(location.origin)),
    scroll: document.scrollingElement.scrollWidth <= innerWidth && document.scrollingElement.scrollHeight <= innerHeight,
    small: [...document.querySelectorAll('.dock button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 42).map((b) => b.textContent.trim()),
    unnamed: [...document.querySelectorAll('button, a')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label'))).length,
    kit: [window.__stories.KIT.logos.length, window.__stories.KIT.mots.length, window.__stories.KIT.acvf.length],
    windows: [[3024, 4032], [4032, 3024], [1080, 1350], [1350, 1080], [2000, 2000], [1080, 1920], [1920, 1080]].map(([w, h]) => window.__stories.nearestWindow(w, h)).join(' '),
  }));
  check(boot.back === 'index.html' && boot.backText === 'Retour au Match Controller', 'link back to the Match Controller', JSON.stringify([boot.back, boot.backText]));
  check(boot.canvas[0] === 1080 && boot.canvas[1] === 1920, 'the preview is a real 1080x1920 canvas');
  check(boot.font, 'club font loaded');
  check(boot.pick && boot.disabled === 'true', 'empty state invites to pick a photo');
  check(boot.externals.length === 0, 'no resource from another origin (works offline)', boot.externals.join(', '));
  check(boot.scroll, 'the page does not scroll on a phone');
  check(boot.small.length === 0, 'dock controls are at least 42 px tall', boot.small.join(', '));
  check(boot.unnamed === 0, 'every button and link has a name');
  check(boot.kit.join() === '15,47,4', 'kit: 15 logos, 47 words, 4 ACVF', boot.kit.join());
  check(boot.windows === '9x16 16x9 1x1 1x1 1x1 9x16 16x9', 'photo shape -> window (3:4 full screen, 4:3 wide, 4:5 and 5:4 square)', boot.windows);
  await shot('1-vide');
  await page.tap('#btn-export', { force: true });   // shown dimmed (aria-disabled) but a thumb can still hit it
  check(await p.toastSays('Ajoute d’abord une photo'), 'exporting without a photo explains what to do');

  /* --- 2. three shapes x three masks: the exported file against the brief --- */
  const shapes = [['9x16', path.join(PHOTOS, 'vertical-KURDE_1184.jpg'), '/__photos/vertical-KURDE_1184.jpg'],
    ['1x1', path.join(TMP, 'square.jpg'), '/__tmp/square.jpg'], ['16x9', path.join(PHOTOS, 'groupe-vainqueurs.jpg'), '/__photos/groupe-vainqueurs.jpg']];
  for (const [shape, file, url] of shapes) {
    const win = WINDOWS[shape];
    await p.setPhoto(file);
    const st = await p.state();
    check(st.win === shape, `${shape}: window detected from the photo`, st.win);
    check(await S((shape) => document.querySelector(`#seg-win [data-win="${shape}"]`).getAttribute('aria-checked') === 'true' && document.querySelector('#pick').hidden, shape), `${shape}: UI follows`);
    for (const mask of ['none', 'club', 'vainqueur']) {
      await p.setMask(mask);
      const ex = await p.exportViaShare();
      const size = jpegSize(ex.buf);
      check(ex.type === 'image/jpeg' && /^FCA-story-\d{8}-\d{6}\.jpg$/.test(ex.name), `${shape}/${mask}: a JPEG named like a story`, ex.type + ' ' + ex.name);
      check(size && size.w === 1080 && size.h === 1920, `${shape}/${mask}: file is 1080x1920`, JSON.stringify(size));
      check(ex.count === 1 && ex.keys.join() === 'files' && ex.fresh !== false, `${shape}/${mask}: one file handed to the share sheet while the tap is fresh`, JSON.stringify([ex.count, ex.keys, ex.fresh]));
      check(ex.buf.length > 60e3 && ex.buf.length < 1.6e6, `${shape}/${mask}: sensible weight`, Math.round(ex.buf.length / 1024) + ' KB');
      await save(`${mask}-${shape}.jpg`, ex.buf);
      const maskUrl = mask === 'none' ? null : `/__kit/Masques/FCA-masque-${mask}-photo-${win.kit}.png`;
      const r = await S(async ({ b64, url, maskUrl, win, shape }) => {
        const t = window.__t, bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const out = await t.pixelsOf(new Blob([bytes], { type: 'image/jpeg' }));
        const ref = await t.reference({ photo: url, mask: maskUrl, win });
        const res = { dims: [out.width, out.height], all: t.compare(out, ref), agree: maskUrl ? await t.maskAgreement(out, maskUrl, win) : null, bands: null, vsRender: t.compare(out, t.rendered()).mean };
        if (shape !== '9x16') res.bands = [t.meanColor(out, { x: 0, y: 0, w: 1080, h: win.y - 20 }), t.meanColor(out, { x: 0, y: win.y + win.h + 20, w: 1080, h: 1920 - win.y - win.h - 20 })];
        window.__last = out;
        return res;
      }, { b64: ex.b64, url, maskUrl, win, shape });
      check(r.dims.join() === '1080,1920', `${shape}/${mask}: decodes to 1080x1920`);
      check(r.all.mean < 3 && r.all.worst < 12, `${shape}/${mask}: export = photo in its window + mask, as the brief composes it`, `mean ${r.all.mean.toFixed(2)}, worst block ${r.all.worst.toFixed(2)} at ${r.all.at}`);
      check(r.vsRender < 2.5, `${shape}/${mask}: the file is the canvas the page drew`, r.vsRender.toFixed(2));
      if (mask === 'none') {
        if (r.bands) check(r.bands.every((c) => near(c[0], 4, 2.5) && near(c[1], 8, 2.5) && near(c[2], 15, 2.5)), `${shape}/none: bands are night navy #04080F`, JSON.stringify(r.bands.map((c) => c.map(Math.round))));
      } else {
        // where the mask is opaque INSIDE the photo window (20 px overlap, light blade), the export shows the mask, not the photo
        check(r.agree.opaqueInWindow > 3000 && r.agree.diff < 4, `${shape}/${mask}: mask drawn on top of the photo`, `${r.agree.opaqueInWindow} opaque px in window, diff ${r.agree.diff.toFixed(2)}`);
      }
    }
  }
  await shot('2-photo-masque');

  /* --- 3. the photo inside its window: one finger moves it, two fingers zoom, it always covers --- */
  await p.setMask('none');
  await page.tap('#seg-win [data-win="9x16"]');   // a 16:9 photo in the tall window: lots to slide sideways
  check((await p.state()).win === '9x16', 'window can be switched by hand');
  const covers = () => S(() => { const s = window.__stories, g = s.photoGeom(), w = s.WIN[s.state.win]; return g.x <= w.x + 0.01 && g.y <= w.y + 0.01 && g.x + g.w >= w.x + w.w - 0.01 && g.y + g.h >= w.y + w.h - 0.01; });
  await S(() => { window.__a = window.__t.rendered(); });
  await p.drag({ x: 400, y: 900 }, { x: 600, y: 900 });
  const shift = await S(() => {   // the same pixels, 200 px further right
    const a = window.__a, b = window.__t.rendered(); let s = 0, n = 0;
    for (let y = 100; y < 1820; y += 3) for (let x = 200; x < 1080; x += 3) { const i = (y * 1080 + x) * 4, j = (y * 1080 + x - 200) * 4; s += Math.abs(b.data[i] - a.data[j]) + Math.abs(b.data[i + 1] - a.data[j + 1]) + Math.abs(b.data[i + 2] - a.data[j + 2]); n += 3; }
    return s / n;
  });
  check(shift < 3, 'one finger slides the photo by exactly the finger travel', shift.toFixed(2));
  await p.drag({ x: 100, y: 900 }, { x: 1000, y: 300 }); await p.drag({ x: 100, y: 900 }, { x: 1000, y: 300 }); await p.drag({ x: 100, y: 900 }, { x: 1000, y: 300 });
  check(await covers(), 'dragged to the limit, the photo still covers its window');
  await p.pinch({ x: 540, y: 960 }, 300, 600);
  let ph = (await p.state()).photo;
  check(near(ph.zoom, 2, 0.06) && await covers(), 'two fingers zoom the photo (x2)', String(ph.zoom));
  await p.pinch({ x: 540, y: 960 }, 600, 40);
  ph = (await p.state()).photo;
  check(ph.zoom === 1 && await covers(), 'the photo cannot be shrunk below its window', String(ph.zoom));
  await p.wheel(540, 700, -300);
  ph = (await p.state()).photo;
  check(ph.zoom > 1.1 && await covers(), 'mouse wheel zooms the photo', String(ph.zoom));

  /* --- 4. stickers: add, move, pinch, and find them in the export --- */
  await p.setPhoto(path.join(PHOTOS, 'vertical-vainqueurs.jpg'));
  await p.setMask('vainqueur');
  await S(() => { window.__bare = window.__t.rendered(); });
  const logo = await p.addFromSheet('logos', () => page.tap('#grid-logos [data-id="FCA-logo-bleu-roi"]'));
  check(logo.kind === 'kit' && near(logo.x, 540, 0.5) && near(logo.y, 960, 0.5) && logo.s === 1, 'a logo lands in the centre', JSON.stringify(logo));
  check(await S(() => window.__stories.state.sel && !document.querySelector('#ctx-sticker').hidden && document.querySelector('#ctx-main').hidden && !document.querySelector('#sel').hidden), 'the new sticker is selected, its actions are shown');
  await shot('3-sticker-selectionne');
  await p.drag({ x: 540, y: 960 }, { x: 250, y: 480 });
  let s = (await p.state()).stickers[0];
  check(near(s.x, 250, 3) && near(s.y, 480, 3), 'one finger moves the sticker where the finger goes', `${s.x},${s.y}`);
  await p.pinch({ x: 250, y: 480 }, 200, 300, 0, 0.5);
  s = (await p.state()).stickers[0];
  check(near(s.s, 1.5, 0.04) && near(s.r, 0.5, 0.02) && near(s.x, 250, 4) && near(s.y, 480, 4), 'two fingers scale (x1.5) and rotate (0.5 rad) it in place', JSON.stringify(s));
  await p.pinch({ x: 250, y: 480 }, 300, 300, 0.5, 0.03);   // turned back to almost level: it snaps straight
  s = (await p.state()).stickers[0];
  check(s.r === 0, 'a sticker turned back to almost level snaps straight', String(s.r));
  await p.pinch({ x: 250, y: 480 }, 300, 200);
  s = (await p.state()).stickers[0];
  check(near(s.s, 1, 0.03), 'pinching in shrinks it back', String(s.s));

  await page.tap('#st-done');
  check(await S(() => !window.__stories.state.sel && document.querySelector('#ctx-sticker').hidden && !document.querySelector('#ctx-main').hidden), 'OK deselects');

  const word = await p.addFromSheet('mots', async () => { await page.tap('#seg-mots [data-c="or"]'); await page.tap('#grid-mots [data-id="FCA-mot-victoire-or"]'); });
  check(word.ref === 'FCA-mot-victoire-or' && near(word.x, 576, 0.5), 'a word (gold) is added, cascaded off the centre', JSON.stringify(word));
  await shot('4-mot-ajoute');
  await p.drag({ x: word.x, y: word.y }, { x: 540, y: 1310 }, { hold: true });   // released on the centre line: must snap to x = 540
  check(await S(() => document.querySelector('#guide-v').classList.contains('on')), 'centre guide shows while the sticker is on the centre line');
  await p.fingers([]);
  s = (await p.state()).stickers[1];
  check(s.x === 540 && near(s.y, 1310, 3) && await S(() => !document.querySelector('#guide-v').classList.contains('on')), 'sticker snaps to the centre line, guide hides on release', `${s.x},${s.y}`);

  const emoji = await p.addFromSheet('emojis', async () => { await page.fill('#emoji-in', '🔥'); await page.tap('#emoji-form button'); });
  check(emoji.kind === 'emoji' && emoji.text === '🔥', 'an emoji typed on the keyboard becomes a sticker', JSON.stringify(emoji));
  await p.drag({ x: emoji.x, y: emoji.y }, { x: 860, y: 420 });
  const ball = await p.addFromSheet('emojis', () => page.tap('#grid-emojis [data-emoji="⚽"]'));
  await p.drag({ x: ball.x, y: ball.y }, { x: 200, y: 1000 });
  await p.pinch({ x: 200, y: 1000 }, 160, 240);

  const phrase = await p.addFromSheet('phrase', async () => { await page.fill('#phrase-in', 'Bravo\nles gars !'); await page.tap('#looks [data-look="bleu"]'); await page.tap('#phrase-add'); });
  check(phrase.kind === 'phrase' && phrase.lines.join('|') === 'BRAVO|LES GARS !' && phrase.look === 'bleu', 'a typed phrase becomes a sticker in the chosen look, in capitals', JSON.stringify(phrase));
  await shot('5-phrase-ajoutee');
  await p.drag({ x: phrase.x, y: phrase.y }, { x: 760, y: 760 });
  await p.pinch({ x: 760, y: 760 }, 200, 150);

  // mouse: drag, wheel = scale, shift + wheel = rotate
  const [mx, my] = await p.client(860, 420), [nx, ny] = await p.client(880, 300);
  await page.mouse.move(mx, my); await page.mouse.down(); await page.mouse.move((mx + nx) / 2, (my + ny) / 2); await page.mouse.move(nx, ny); await page.mouse.up();
  s = (await p.state()).stickers[2];
  check(near(s.x, 880, 4) && near(s.y, 300, 4), 'mouse drags a sticker', `${s.x},${s.y}`);
  const s0 = s.s;
  await p.wheel(880, 300, -200);
  s = (await p.state()).stickers[2];
  check(s.s > s0 * 1.1, 'mouse wheel scales the selected sticker', `${s0} -> ${s.s}`);
  await p.wheel(880, 300, 300, true);
  s = (await p.state()).stickers[2];
  check(s.r > 0.1, 'shift + wheel rotates it', String(s.r));

  // every sticker is in the export where it was left, at its size; nothing else changed
  await page.tap('#st-done');
  const all = (await p.state()).stickers;
  const inks = [];
  for (const st of all) inks.push(await p.inkBox(st.id));
  const found = await S((inks) => window.__t.changes(window.__bare, window.__t.rendered(), inks), inks);
  all.forEach((st, i) => {
    const b = inks[i], f = found.items[i], label = st.ref || st.text || st.lines.join(' ');
    check(f.n > 0.12 * b.w * b.h, `export shows "${label}"`, `${f.n} px changed for a ${Math.round(b.w)}x${Math.round(b.h)} sticker`);
    check(near(f.cx, b.cx, 0.09 * b.w + 6) && near(f.cy, b.cy, 0.09 * b.h + 6) && Math.abs(f.offx) < 0.05 * b.w + 12 && Math.abs(f.offy) < 0.05 * b.h + 12, `"${label}" sits where it was placed`, `expected ${Math.round(b.cx)},${Math.round(b.cy)} found ${Math.round(f.cx)},${Math.round(f.cy)} (box off by ${f.offx.toFixed(1)},${f.offy.toFixed(1)})`);
    // the visible sticker spans its solid box; soft halos and shadows may reach a little further, never much
    check(f.w > b.w - 24 && f.w < b.w + 110 && f.h > b.h - 24 && f.h < b.h + 110, `"${label}" has the size it was pinched to`, `solid box ${Math.round(b.w)}x${Math.round(b.h)}, seen ${Math.round(f.w)}x${Math.round(f.h)}`);
  });
  check(found.stray < 60, 'nothing changed outside the stickers', found.stray + ' stray px');
  const withStickers = await p.exportViaShare();
  await save('stickers-vainqueur-9x16.jpg', withStickers.buf);
  const sz = jpegSize(withStickers.buf);
  check(sz.w === 1080 && sz.h === 1920, 'story with stickers: 1080x1920');
  const fileVsCanvas = await S(async (b64) => {
    const out = await window.__t.pixelsOf(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }));
    return window.__t.compare(out, window.__t.rendered()).mean;
  }, withStickers.b64);
  check(fileVsCanvas < 2.5, 'the shared file carries the stickers exactly as drawn', fileVsCanvas.toFixed(2));

  // selection actions
  await p.fingers([{ id: 0, x: 250, y: 480 }]); await p.fingers([]);   // a tap on the logo
  check((await p.state()).sel === all[0].id, 'a tap selects the sticker under the finger');
  await page.tap('#st-front');
  check((await p.state()).stickers.map((x) => x.id).pop() === all[0].id, '"Devant" brings it to the front');
  await page.tap('#st-dup');
  let now = await p.state();
  const copy = now.stickers[now.stickers.length - 1];
  check(now.stickers.length === 6 && copy.ref === 'FCA-logo-bleu-roi' && near(copy.x, 294, 4) && now.sel === copy.id, '"Dupliquer" adds a copy next to it, selected', JSON.stringify(copy));
  await page.tap('#st-del');
  now = await p.state();
  check(now.stickers.length === 5 && !now.sel, '"Supprimer" removes the selected sticker');
  const ph0 = now.stickers.find((x) => x.kind === 'phrase');
  await p.fingers([{ id: 0, x: ph0.x, y: ph0.y }]); await p.fingers([]);
  check(await S(() => !document.querySelector('#st-edit').hidden), '"Modifier" is offered for a phrase');
  await page.tap('#st-edit');
  await page.waitForFunction(() => document.querySelector('#sheet-stickers.on') && document.querySelector('#phrase-in').value === 'BRAVO\nLES GARS !');
  await page.fill('#phrase-in', 'Bravo\nles champions');
  await page.tap('#looks [data-look="or"]');
  await shot('6-phrase-modifier');
  await page.tap('#phrase-add');
  await page.waitForFunction(() => !document.querySelector('.sheet.on'));
  const ph1 = (await p.state()).stickers.find((x) => x.kind === 'phrase');
  check(ph1.lines.join('|') === 'BRAVO|LES CHAMPIONS' && ph1.look === 'or' && ph1.x === ph0.x && ph1.y === ph0.y && ph1.id === ph0.id, 'an edited phrase keeps its place', JSON.stringify(ph1));
  await p.fingers([{ id: 0, x: 540, y: 150 }]); await p.fingers([]);   // a tap on the bare photo
  check(!(await p.state()).sel, 'a tap on the photo deselects');
  await page.keyboard.press('Escape');

  // safe zones: an overlay of the editor, never part of the story
  await S(() => { window.__noZones = window.__t.rendered(); });
  await page.tap('#btn-safe');
  const safe = await S(() => { const st = document.querySelector('#stage').getBoundingClientRect(), a = document.querySelector('.safe-top').getBoundingClientRect(), b = document.querySelector('.safe-bot').getBoundingClientRect(); return { on: document.querySelector('#stage').classList.contains('show-safe'), top: a.height / st.height * 1920, bot: b.height / st.height * 1920, flushTop: Math.abs(a.top - st.top) < 1, flushBot: Math.abs(b.bottom - st.bottom) < 1 }; });
  check(safe.on && near(safe.top, 230, 4) && near(safe.bot, 330, 4) && safe.flushTop && safe.flushBot, 'Instagram safe zones: 230 px on top, 330 px at the bottom', JSON.stringify(safe));
  await shot('7-zones');
  const sameWithZones = await S(() => window.__t.compare(window.__noZones, window.__t.rendered()).mean);
  check(sameWithZones === 0, 'safe zones are not drawn in the story');
  await page.tap('#btn-safe');

  /* --- 5. export sheet: format, share again, next photo keeps mask + stickers --- */
  const first = await p.exportViaShare({ keepOpen: true });
  await page.waitForTimeout(350);
  await shot('8-export');
  const sheet = await S(() => ({ img: document.querySelector('#export-img').naturalWidth, share: !document.querySelector('#btn-share').hidden, href: document.querySelector('#btn-save').href.slice(0, 5), dl: document.querySelector('#btn-save').download, hint: document.querySelector('#export-hint').textContent }));
  check(sheet.img === 1080 && sheet.share && sheet.href === 'blob:' && /\.jpg$/.test(sheet.dl) && /Instagram/.test(sheet.hint), 'export sheet shows the story, Partager and Enregistrer', JSON.stringify(sheet));
  await page.tap('#seg-fmt [data-fmt="png"]');
  await page.waitForFunction(() => window.__stories.rt.out.type === 'image/png');
  const png = await S(async () => ({ name: window.__stories.rt.out.name, dl: document.querySelector('#btn-save').download, b64: await window.__t.b64(window.__stories.rt.out.file) }));
  const pngBuf = Buffer.from(png.b64, 'base64'), ps = pngSize(pngBuf);
  check(ps && ps.w === 1080 && ps.h === 1920 && /\.png$/.test(png.name) && png.dl === png.name && pngBuf.length > first.buf.length, 'PNG option: a 1080x1920 PNG, heavier than the JPEG', JSON.stringify([ps, png.name, pngBuf.length, first.buf.length]));
  const sharedBefore = await S(() => window.__shared.length);
  await page.tap('#btn-share');
  check(await S((n) => window.__shared.length === n + 1 && window.__shared[n].files[0].type === 'image/png', sharedBefore), 'Partager shares the file again, in the chosen format');
  await S(() => { window.__shareFails = true; });
  await page.tap('#btn-share');
  check(await p.toastSays('Partager'), 'a refused share says what to do');
  await S(() => { window.__shareFails = false; });
  await page.tap('#seg-fmt [data-fmt="jpeg"]');
  await page.waitForFunction(() => window.__stories.rt.out.type === 'image/jpeg');

  const beforeNext = await p.state();
  await S(() => { window.__photoWas = window.__stories.rt.photo; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.tap('#btn-next')]);
  await chooser.setFiles(path.join(PHOTOS, 'KURDE_2242.jpg'));
  await page.waitForFunction(() => window.__stories.rt.photo !== window.__photoWas && document.querySelector('#busy').hidden && !document.querySelector('.sheet.on'));
  check(await p.toastSays('conservés'), 'next photo: says mask and stickers are kept');
  await page.waitForFunction(() => window.__stories.rt.mask && window.__stories.rt.maskKey === 'vainqueur/16x9');
  const afterNext = await p.state();
  check(afterNext.win === '16x9' && afterNext.mask === 'vainqueur' && afterNext.photo.zoom === 1 && afterNext.photo.cx === 0.5, 'next photo: window re-detected, mask kept (right file for the new window), framing reset', JSON.stringify([afterNext.win, afterNext.mask, afterNext.photo]));
  check(JSON.stringify(afterNext.stickers) === JSON.stringify(beforeNext.stickers), 'next photo: stickers untouched');
  await page.waitForTimeout(400);
  await shot('9-photo-suivante');
  await save('photo-suivante-vainqueur-16x9.jpg', (await p.exportViaShare()).buf);

  /* --- 6. an accidental reload --- */
  await page.waitForTimeout(900);   // layout is saved 300 ms after the last change; the photo a moment later
  const beforeReload = await p.state(), pxBefore = await S(() => Array.from(window.__t.rendered().data.filter((_, i) => i % 4001 === 0)));
  await p.open();
  await page.waitForFunction(() => window.__stories.rt.mask || window.__stories.state.mask === 'none');
  const afterReload = await p.state();
  const what = (st) => JSON.stringify([st.win, st.mask, st.photo, st.stickers.map((x) => [x.kind, x.ref || x.text || x.lines.join('|') + x.look])]);
  const sameSpots = afterReload.stickers.length === beforeReload.stickers.length && afterReload.stickers.every((x, i) => { const y = beforeReload.stickers[i]; return near(x.x, y.x, 0.02) && near(x.y, y.y, 0.02) && near(x.s, y.s, 0.001) && near(x.r, y.r, 0.001); });   // the saved layout is rounded
  check(what(afterReload) === what(beforeReload) && sameSpots, 'reload: window, mask, framing and stickers are back', what(afterReload));
  const pxAfter = await S(() => (window.__stories.rt.photo ? Array.from(window.__t.rendered().data.filter((_, i) => i % 4001 === 0)) : null));
  const drift = pxAfter ? pxAfter.reduce((a, v, i) => a + Math.abs(v - pxBefore[i]), 0) / pxAfter.length : 999;
  check(drift < 4, 'reload: the photo is back too, the story looks the same', drift.toFixed(2));
  // the photo could not be kept (private mode, storage wiped): layout survives, the page asks for the photo
  await S(() => new Promise((res, rej) => { const q = indexedDB.open('fca-mc-stories', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('photo'); tx.oncomplete = res; tx.onerror = rej; }; q.onerror = rej; }));
  await p.open();
  const lost = await S(() => ({ photo: !!window.__stories.rt.photo, pick: !document.querySelector('#pick').hidden, sub: document.querySelector('#pick-sub').textContent, n: window.__stories.state.stickers.length, mask: window.__stories.state.mask }));
  check(!lost.photo && lost.pick && /Rechoisis/.test(lost.sub) && lost.n === 5 && lost.mask === 'vainqueur', 'reload without the stored photo: asks to pick it again, keeps mask and stickers', JSON.stringify(lost));
  await shot('10-rechoisir-photo');
  // the page re-saves its layout when it unloads: the snapshot is aged just before the next load reads it
  await p.ctx.addInitScript(() => {
    try {
      const k = 'fca-mc:v1:stories', v = JSON.parse(localStorage.getItem(k) || 'null');
      if (v && !sessionStorage.getItem('aged')) { sessionStorage.setItem('aged', '1'); v.t = Date.now() - 13 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(v)); }
    } catch (_) { /* nothing stored yet */ }
  });
  await p.open();
  const stale = await p.state();
  check(stale.stickers.length === 0 && stale.mask === 'none', 'a layout older than 12 h is not brought back', JSON.stringify([stale.stickers.length, stale.mask]));

  /* --- 7. reset --- */
  await p.setPhoto(path.join(PHOTOS, 'vertical-KURDE_1184.jpg'));
  await p.setMask('club');
  await p.addFromSheet('acvf', () => page.tap('#grid-acvf [data-id="FCA-acvf-sticker"]'));
  check((await p.state()).stickers[0].ref === 'FCA-acvf-sticker', 'an ACVF logo is added');
  await page.tap('#st-done');
  await p.exportViaShare({ keepOpen: true });
  page.once('dialog', (d) => d.accept());
  await page.tap('#btn-reset');
  await page.waitForFunction(() => !document.querySelector('.sheet.on'));
  const wiped = await p.state();
  check(!wiped.photo && wiped.mask === 'none' && wiped.stickers.length === 0 && await S(() => !document.querySelector('#pick').hidden), '"Tout effacer" gives a blank story back');

  check(p.errors.length === 0, 'no script error during the whole session', p.errors.slice(0, 3).join(' | '));
  await p.close();

  /* --- 8. hard photos: EXIF-rotated, 48 MP, unreadable; failing network --- */
  const q = await phone(engine);
  await q.setPhoto(path.join(PHOTOS, 'vertical-KURDE_1184.jpg'));
  await q.S(() => { window.__upright = window.__t.rendered(); });
  await q.setPhoto(path.join(TMP, 'exif6.jpg'));
  const ex6 = await q.S(() => ({ photo: window.__stories.state.photo, win: window.__stories.state.win, diff: window.__t.compare(window.__upright, window.__t.rendered()) }));
  check(ex6.photo.w === 1080 && ex6.photo.h === 1920 && ex6.win === '9x16', 'EXIF orientation 6: the photo is stood upright', JSON.stringify(ex6.photo));
  check(ex6.diff.mean < 4 && ex6.diff.worst < 14, 'EXIF orientation 6: same picture as the upright original', `mean ${ex6.diff.mean.toFixed(2)}, worst block ${ex6.diff.worst.toFixed(2)}`);
  const tBig = Date.now();
  await q.setPhoto(path.join(TMP, 'big48.jpg'));
  const big = await q.S(async () => ({ photo: window.__stories.state.photo, win: window.__stories.state.win, canvas: [window.__stories.rt.photo.width, window.__stories.rt.photo.height],
    diff: window.__t.compare(window.__t.rendered(), await window.__t.reference({ photo: '/__tmp/big48.jpg', mask: null, win: { y: 656, h: 608 } })) }));
  check(big.canvas.join() === '2400,1800' && big.win === '16x9', `48 MP photo (8064x6048) is reduced on load to 2400x1800 (${Date.now() - tBig} ms)`, JSON.stringify(big.canvas));
  check(big.diff.mean < 3 && big.diff.worst < 12, '48 MP photo: correct picture in the 16:9 window', `mean ${big.diff.mean.toFixed(2)}, worst ${big.diff.worst.toFixed(2)}`);
  const ok48 = await q.exportViaShare();
  check(jpegSize(ok48.buf).h === 1920, '48 MP photo: exports');
  await q.page.setInputFiles('#file', path.join(TMP, 'broken.jpg'));
  check(await q.toastSays('ne peut pas être lue') && (await q.state()).photo.w === 2400, 'an unreadable photo is refused in plain French, the story is left as it was');

  await q.page.route('**/stories/logos/FCA-logo-or.webp*', (r) => r.abort());
  await q.page.tap('#btn-stickers'); await q.page.tap('#tabs [data-tab="logos"]'); await q.page.tap('#grid-logos [data-id="FCA-logo-or"]');
  check(await q.toastSays('n’a pas pu être chargé') && (await q.state()).stickers.length === 0, 'a sticker that cannot be downloaded: clear message, nothing half-added');
  await q.page.unroute('**/stories/logos/FCA-logo-or.webp*');
  await q.page.tap('#grid-logos [data-id="FCA-logo-or"]');
  await q.page.waitForFunction(() => window.__stories.state.stickers.length === 1 && !document.querySelector('.sheet.on'));
  check(true, 'the same sticker works on the next tap, once the network is back');
  await q.page.waitForTimeout(300);
  await q.page.tap('#st-done');
  await q.page.route('**/stories/masques/FCA-masque-vainqueur-photo-16x9.webp*', (r) => r.abort());
  await q.page.tap('#seg-mask [data-mask="vainqueur"]');
  check(await q.toastSays('Le masque n’a pas pu être chargé') && (await q.state()).mask === 'none', 'a mask that cannot be downloaded: clear message, back to no mask');
  await q.page.unroute('**/stories/masques/FCA-masque-vainqueur-photo-16x9.webp*');
  await q.setMask('vainqueur');
  await q.page.tap('#btn-stickers'); await q.page.tap('#tabs [data-tab="emojis"]'); await q.page.fill('#emoji-in', 'bravo'); await q.page.tap('#emoji-form button');
  check(await q.toastSays('seulement des emojis'), 'letters in the emoji field: pointed to the Phrase tab');
  await q.page.tap('#tabs [data-tab="phrase"]'); await q.page.fill('#phrase-in', '   '); await q.page.tap('#phrase-add');
  check(await q.toastSays('Écris d’abord ta phrase') && (await q.state()).stickers.length === 1, 'an empty phrase is not added');
  await q.closeSheet();
  check(q.errors.length === 0, 'no script error with hard photos and a failing network', q.errors.slice(0, 3).join(' | '));
  await q.close();

  /* --- 9. no share sheet (computer, old browser): the file is downloaded --- */
  const d = await phone(engine, { share: 'none' });
  await d.setPhoto(path.join(TMP, 'square.jpg'));
  await d.setMask('club');
  const [download] = await Promise.all([d.page.waitForEvent('download', { timeout: 20000 }), d.page.tap('#btn-export')]);
  const dlPath = path.join(TMP, `${name}-download.jpg`);
  await download.saveAs(dlPath);
  const dl = jpegSize(await readFile(dlPath));
  check(dl && dl.w === 1080 && dl.h === 1920 && /^FCA-story-.*\.jpg$/.test(download.suggestedFilename()), 'without a share sheet the story is downloaded, 1080x1920', download.suggestedFilename());
  check(await d.S(() => document.querySelector('#btn-share').hidden && /téléchargée/.test(document.querySelector('#export-hint').textContent)), 'the export sheet then offers Enregistrer only');
  await d.close();

  /* --- 10. offline: once the kit is on the phone, the network can go --- */
  const o = await phone(engine, { sw: 'allow' });
  const warmed = await o.page.waitForFunction(() => document.querySelector('#kit-status').textContent === 'Prêt hors ligne', null, { timeout: 90000 }).then(() => true, () => false);
  check(warmed, 'the page reports the kit as ready offline');
  if (warmed) {
    await networkDown();
    try {
      const dead = await o.S(() => fetch('index.html?' + Date.now()).then(() => false, () => true));
      check(dead, 'offline: the server is really unreachable');
      const reloaded = await o.open().then(() => true, (e) => { console.log('   offline reload: ' + e.message.split('\n')[0]); return false; });
      check(reloaded, 'offline: the page opens again from the phone');
      if (reloaded) {
        await o.setPhoto(path.join(PHOTOS, 'groupe-vainqueurs.jpg'));
        await o.setMask('vainqueur');
        const crest = await o.addFromSheet('logos', () => o.page.tap('#grid-logos [data-id="FCA-logo-degrade-blanc-or"]'));
        await o.drag({ x: crest.x, y: crest.y }, { x: 540, y: 1600 });
        await o.addFromSheet('mots', async () => { await o.page.tap('#seg-mots [data-c="bleu"]'); await o.page.tap('#grid-mots [data-id="FCA-mot-entrainement-bleu"]'); });
        const thumbs = await o.S(() => [...document.querySelectorAll('#grid-logos img')].filter((i) => i.complete && i.naturalWidth > 0).length);
        check(thumbs >= 6, 'offline: sticker thumbnails are there', String(thumbs));
        await o.page.tap('#st-done');
        const off = await o.exportViaShare();
        check(jpegSize(off.buf).w === 1080 && (await o.state()).stickers.length === 2 && await o.S(() => !!window.__stories.rt.mask), 'offline: photo + mask + stickers + export all work');
        await save('hors-ligne-vainqueur-16x9.jpg', off.buf);
      }
    } finally { await networkUp(); }
  }
  await o.close();

  /* --- 11. a small phone (iPhone SE) --- */
  const se = await phone(engine, { viewport: { width: 375, height: 548 } });
  await se.setPhoto(path.join(PHOTOS, 'vertical-CONCORDIA_8419.jpg'));
  await se.setMask('club');
  const fit = await se.S(() => { const st = document.querySelector('#stage').getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect(); return { w: st.width, ratio: st.height / st.width, inside: dock.bottom <= innerHeight + 0.5 && st.top >= 0 && st.bottom <= dock.top + 0.5, scroll: document.scrollingElement.scrollHeight <= innerHeight }; });
  check(fit.w >= 150 && near(fit.ratio, 16 / 9, 0.02) && fit.inside && fit.scroll, 'small phone: the 9:16 stage and the whole dock fit on screen', JSON.stringify(fit));
  await se.page.screenshot({ path: path.join(OUT, `ui-${name}-11-petit-ecran.png`) });
  await se.close();

  console.log(`${name}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

console.log('fixtures…');
await makeFixtures();
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (ONLY && ONLY !== name) continue;
  const p0 = passed, f0 = failed;
  try { await run(name, engine); } catch (e) { failed++; console.log(`   FAIL [${name}] the run stopped: ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
  console.log(`${name}: ${passed - p0} checks passed, ${failed - f0} failed`);
}
server.close();
console.log(failed ? `STORIES E2E: ${failed} FAILED (${passed} passed)` : `STORIES E2E: PASS (${passed} checks)`);
console.log('exports to look at: ' + OUT);
process.exit(failed ? 1 : 0);

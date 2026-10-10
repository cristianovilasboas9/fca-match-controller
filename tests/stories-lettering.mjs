// Proves that the canvas lettering of stories.html (the "Phrase" sticker) is a faithful port of the SVG
// template that drew the club's 47 word stickers: every word of the kit is re-drawn by the page with the
// same text and options, then compared pixel by pixel with the original PNG.
//
//   node tests/stories-lettering.mjs [--kit ~/Desktop/MASKFCA] [--mots .../final/mots/mots.json] [--out DIR]
//
// Pass = same canvas size (±2 px, rounding of the font metrics) and a mean difference under 2.5 % on
// Chromium, the engine that drew the originals (WebKit rasterises outlines a little differently: 4 %).
// With --out, side-by-side sheets (original above, page below) are written for the eye.
import { chromium, webkit } from '/Users/cristiano/Business/fc-atlantic-vevey/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = arg('kit', path.join(homedir(), 'Desktop/MASKFCA'));
const MOTS = arg('mots', path.join(homedir(), 'Business/STUDIO_MARKETING_IA/projects/fca/masques-instagram-2627/final/mots/mots.json'));
const OUT = arg('out', '');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.otf': 'font/otf', '.woff2': 'font/woff2' };

// the worktree, plus /__kit/ = the original PNG words
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = p.startsWith('/__kit/') ? path.join(KIT, 'Mots', path.basename(p)) : path.join(ROOT, p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (_) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://localhost:' + server.address().port;

const words = JSON.parse(readFileSync(MOTS, 'utf8'));
const cases = [];
for (const w of words) for (const v of ['blanc', 'bleu', ...(w.or ? ['or'] : [])]) {
  const name = `FCA-mot-${w.slug}-${v}.png`;
  if (existsSync(path.join(KIT, 'Mots', name))) cases.push({ name, lines: w.lines.map((l) => l.toUpperCase()), look: v, opts: w.opts || {} });
}

let failed = 0;
for (const [engineName, engine, limit] of [['chromium', chromium, 2.5], ['webkit', webkit, 4]]) {
  const browser = await engine.launch();
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await page.goto(base + '/stories.html');
  await page.evaluate(() => window.__stories.ready);
  const results = await page.evaluate(async (cases) => {
    const S = window.__stories, out = [];
    for (const c of cases) {
      const ref = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = '/__kit/' + c.name; });
      const mine = S.renderPhrase(c.lines, c.look, +(c.opts.cap || 270), c.opts).canvas;
      const w = Math.max(ref.naturalWidth, mine.width), h = Math.max(ref.naturalHeight, mine.height);
      const data = (src, sw, sh) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(src, Math.round((w - sw) / 2), Math.round((h - sh) / 2)); return g.getImageData(0, 0, w, h).data; };
      const a = data(ref, ref.naturalWidth, ref.naturalHeight), b = data(mine, mine.width, mine.height);
      let sum = 0, far = 0;   // compared as seen on a page: colour weighted by opacity, plus opacity itself
      for (let i = 0; i < a.length; i += 4) {
        const d = (Math.abs(a[i] * a[i + 3] - b[i] * b[i + 3]) + Math.abs(a[i + 1] * a[i + 3] - b[i + 1] * b[i + 3]) + Math.abs(a[i + 2] * a[i + 3] - b[i + 2] * b[i + 3])) / 765 + Math.abs(a[i + 3] - b[i + 3]);
        sum += d / 2; if (d / 2 > 64) far++;
      }
      // side by side for the eye
      const sheet = document.createElement('canvas'); sheet.width = w; sheet.height = h * 2 + 10;
      const g = sheet.getContext('2d'); g.fillStyle = '#3F6B4A'; g.fillRect(0, 0, sheet.width, sheet.height);
      g.drawImage(ref, 0, 0); g.drawImage(mine, 0, h + 10);
      out.push({ name: c.name, ref: [ref.naturalWidth, ref.naturalHeight], mine: [mine.width, mine.height], mean: sum / (a.length / 4) / 255 * 100, far: far / (a.length / 4) * 100, sheet: sheet.toDataURL('image/jpeg', 0.85) });
    }
    return out;
  }, cases);
  let worst = 0;
  for (const r of results) {
    const sizeOk = Math.abs(r.ref[0] - r.mine[0]) <= 2 && Math.abs(r.ref[1] - r.mine[1]) <= 2, ok = sizeOk && r.mean <= limit;
    worst = Math.max(worst, r.mean);
    if (!ok) { failed++; console.log(`  FAIL ${engineName} ${r.name}: original ${r.ref.join('x')}, page ${r.mine.join('x')}, mean diff ${r.mean.toFixed(2)} %, far pixels ${r.far.toFixed(2)} %`); }
    if (OUT) { await mkdir(OUT, { recursive: true }); await writeFile(path.join(OUT, `${engineName}-${r.name.replace('.png', '.jpg')}`), Buffer.from(r.sheet.split(',')[1], 'base64')); }
  }
  console.log(`${engineName}: ${results.length} words compared, worst mean difference ${worst.toFixed(2)} % (limit ${limit} %)`);
  await browser.close();
}
server.close();
console.log(failed ? `LETTERING: ${failed} FAILED` : 'LETTERING: PASS');
process.exit(failed ? 1 : 0);

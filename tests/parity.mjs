/* Export vs preview — "l'export doit correspondre à l'aperçu".
 *
 * For each card, renders the poster twice at full resolution:
 *   - by the browser itself (a screenshot of the same HTML the preview shows)
 *   - by the export path (html2canvas → PNG)
 * and compares them. html2canvas re-implements CSS painting, so tiny
 * differences are expected (anti-aliasing, gradient banding); a layout or
 * rendering divergence (missing layer, shifted block, unsupported property)
 * shows up as a large local difference.
 *
 *   node tests/parity.mjs [--engines chromium,webkit] [--save] [--root DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openApp, exportDirect, PROFILES, ROOT, OUT_DIR, sleep, IPHONE } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const engines = arg('engines', 'chromium,webkit').split(',');
const save = process.argv.includes('--save');
const CARDS = [
  { name: 'matchday-story', variant: 'matchday', format: 'story', slug: 'fc-slavia-ls', ha: 'home' },
  { name: 'matchday-post',  variant: 'matchday', format: 'post',  slug: 'racing-club-lausanne-ii', ha: 'home' },
  { name: 'matchday-away',  variant: 'matchday', format: 'story', slug: 'cs-la-tour-de-peilz-ii', ha: 'away' },
  { name: 'kickoff-story',  variant: 'kickoff',  format: 'story', slug: 'fc-slavia-ls', ha: 'home' },
  { name: 'recap-story',    variant: 'recap',    format: 'story', slug: 'racing-club-lausanne-ii', ha: 'home', goals: 2 },
  { name: 'recap-post',     variant: 'recap',    format: 'post',  slug: 'fc-slavia-ls', ha: 'away', goals: 6 },
];
const srv = await startServer(path.resolve(arg('root', ROOT)));
let failures = 0;
for (const engine of engines) {
  /* DPR 1: the screenshot of a 1080px poster is then 1080px wide, like the export */
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok, device: { ...IPHONE, deviceScaleFactor: 1 } });
  const { page } = app;
  await page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id) && Object.keys(PHOTO_CACHE).length >= 20, null, { timeout: 60000 });
  for (const c of CARDS) {
    await page.evaluate((c) => {
      const S = window.__mc.state;
      applyMatch(window.__mc.MATCHES.find(x => x.opponentSlug === c.slug && x.homeAway === c.ha).id);
      Object.assign(S, { variant: c.variant, format: c.format, heroOff: false, heroSceneId: '', sceneId: '', customHeroImage: '' });
      if (c.goals) { S.goals = window.__mc.ROSTER.filter(p => p._active !== false && p.photoUrl).slice(3, 3 + c.goals).map((p, i) => ({ minute: 12 + i * 21, playerId: p.id, side: 'home', ts: i + 1 })); syncScoreFromGoals(); }
      renderAll();
    }, c);
    await sleep(1800);
    const exported = await exportDirect(page);
    /* the browser's own rendering of the very same HTML */
    const size = await page.evaluate(() => {
      const stage = document.createElement('div');
      stage.id = 'parity-stage';
      stage.style.cssText = 'position:absolute; left:0; top:0; z-index:9999;';
      stage.innerHTML = posterHTML();
      document.body.appendChild(stage);
      const n = stage.querySelector('#poster-node');
      return { w: n.offsetWidth, h: n.offsetHeight };
    });
    await page.setViewportSize({ width: size.w, height: size.h });
    await sleep(400);
    const shot = await page.locator('#parity-stage #poster-node').screenshot({ type: 'png' });
    await page.evaluate(() => document.getElementById('parity-stage').remove());
    await page.setViewportSize({ width: IPHONE.viewport.width, height: IPHONE.viewport.height });
    /* compare in the page: both PNGs drawn at 1/4 size, per-cell mean abs diff */
    const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const [A, B] = [await load(a), await load(b)];
      const w = Math.round(A.naturalWidth / 4), h = Math.round(A.naturalHeight / 4);
      const px = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
      const da = px(A), db = px(B);
      const G = 18, cw = w / G, ch = h / G;
      const cells = new Float64Array(G * G), cnt = new Float64Array(G * G);
      let total = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
        total += d;
        const k = Math.min(G - 1, Math.floor(y / ch)) * G + Math.min(G - 1, Math.floor(x / cw));
        cells[k] += d; cnt[k]++;
      }
      let worst = 0, at = 0;
      for (let k = 0; k < G * G; k++) { const v = cells[k] / cnt[k]; if (v > worst) { worst = v; at = k; } }
      return { sameSize: A.naturalWidth === B.naturalWidth && A.naturalHeight === B.naturalHeight, sizeA: [A.naturalWidth, A.naturalHeight], sizeB: [B.naturalWidth, B.naturalHeight],
        mean: +(total / (w * h)).toFixed(2), worstCell: +worst.toFixed(1), worstAt: [at % G, Math.floor(at / G)] };
    }, [b64(exported), b64(shot)]);
    /* Thresholds (mean abs diff per channel, 0-255). Calibrated on the cards
       validated before the redesign: html2canvas vs the browser gives a mean of
       3.6-4.9 and a worst zone of 16-18 there (anti-aliased text edges, radial
       gradients). A missing layer or a shifted block is far above. */
    const ok = r.sameSize && r.mean < 7 && r.worstCell < 30;
    if (!ok) failures++;
    console.log(`[${engine}] ${c.name.padEnd(15)} ${ok ? '·' : '✗'} écart moyen ${r.mean}/255 · pire zone ${r.worstCell}/255 (case ${r.worstAt}) · tailles ${r.sizeA.join('x')} / ${r.sizeB.join('x')}`);
    if (save || !ok) {
      fs.writeFileSync(path.join(OUT_DIR, `parity-${engine}-${c.name}-export.png`), exported);
      fs.writeFileSync(path.join(OUT_DIR, `parity-${engine}-${c.name}-browser.png`), shot);
    }
  }
  await app.close();
}
await srv.close();
console.log(failures ? `\n✗ ${failures} carte(s) où l'export s'écarte de l'aperçu` : '\n✓ export conforme à l\'aperçu');
process.exit(failures ? 1 : 0);

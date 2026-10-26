/* Photos du match (Boss 26.10) — the match photo picker and the framing
 * controls of a full-frame photo (drag on the card, Recentrer, size, effects).
 *
 *   node tests/photos.mjs [--engines chromium,webkit] [--export]
 *
 * Per engine:
 *   A. picker: manifest grid (newest set first, lazy thumbnails), tap a photo →
 *      it is the card's visual on EVERY variant that has one, both formats;
 *      only its path is stored (no data URL in the state / snapshot)
 *   B. drag on the preview (mouse, + touch on chromium) moves the photo, never
 *      past an edge, and does not export; a plain tap still exports
 *   C. size slider 100-300 %, effects slider (0 = pure photo, 200 = dominant,
 *      default snaps back), Recentrer
 *   D. relaunch: photo + framing come back from the match snapshot
 *   E. another visual resets the framing (effects kept)
 *   F. export = preview (html2canvas vs the browser) with the photo at default
 *      and moved / zoomed / effects changed, story and post
 * --export writes the review PNGs to validation-photos-2610/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openApp, exportViaTap, exportDirect, PROFILES, ROOT, OUT_DIR, sleep, IPHONE } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const engines = arg('engines', 'chromium,webkit').split(',');
const doExport = process.argv.includes('--export');
const VALID = path.join(ROOT, 'validation-photos-2610');
const SET = 'racing-2510', PHOTO = 'dsc-2532', LANDSCAPE = 'dsc-2542';

const srv = await startServer(ROOT);
let failures = 0;
const check = (engine, label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`[${engine}] ${ok ? '·' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
};

/* Racing LS II at home, 2-2, two FCA scorers with a cutout */
async function racingMatch(page, extra = {}) {
  await page.evaluate((extra) => {
    const S = window.__mc.state;
    const m = window.__mc.MATCHES.find(x => x.opponentSlug === 'racing-club-lausanne-ii' && x.homeAway === 'home');
    applyMatch(m.id);
    const scorers = window.__mc.ROSTER.filter(p => p._active !== false && p.cutoutUrl).slice(2, 4);
    S.goals = [
      { minute: 18, playerId: scorers[0].id, side: 'home', ts: 1 },
      { minute: 40, playerId: '', side: 'away', ts: 2 },
      { minute: 63, playerId: '', side: 'away', ts: 3 },
      { minute: 81, playerId: scorers[1].id, side: 'home', ts: 4 },
    ];
    S.scorerId = scorers[1].id; S.scorerSide = 'home'; S.minute = 81;
    syncScoreFromGoals();
    Object.assign(S, extra);
    renderAll();
  }, extra);
}
const setCard = (page, variant, format) => page.evaluate(([v, f]) => {
  Object.assign(window.__mc.state, { variant: v, format: f });
  renderAll();
}, [variant, format]);
/* the full-frame photo the PREVIEW shows: its box in card pixels */
const previewPhoto = (page) => page.evaluate(() => {
  const el = document.querySelector('#poster-root img[data-photo-layer]');
  if (!el) return null;
  const fr = el.parentElement;
  return { left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, W: fr.offsetWidth, H: fr.offsetHeight,
    isData: el.src.startsWith('data:'), nat: [el.naturalWidth, el.naturalHeight] };
});
const st = (page) => page.evaluate(() => {
  const S = window.__mc.state;
  return { heroPhoto: S.heroPhoto, pos: { ...S.visualPos }, zoom: S.visualZoom, fx: S.visualFx, heroPlayerId: S.heroPlayerId };
});

async function compare(page, exported, shot) {
  const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64');
  return page.evaluate(async ([a, b]) => {
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
    return { sameSize: A.naturalWidth === B.naturalWidth && A.naturalHeight === B.naturalHeight,
      mean: +(total / (w * h)).toFixed(2), worstCell: +worst.toFixed(1), worstAt: [at % G, Math.floor(at / G)] };
  }, [b64(exported), b64(shot)]);
}
/* the browser's own rendering of the current poster at full size (DPR 1) */
async function browserShot(page) {
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
  await page.evaluate(() => Promise.all([...document.querySelectorAll('#parity-stage img')].map(im => im.decode().catch(() => {}))));
  await sleep(300);
  const shot = await page.locator('#parity-stage #poster-node').screenshot({ type: 'png' });
  await page.evaluate(() => document.getElementById('parity-stage').remove());
  await page.setViewportSize({ width: IPHONE.viewport.width, height: IPHONE.viewport.height });
  return shot;
}

for (const engine of engines) {
  const app = await openApp(engine, srv.url, { profile: PROFILES.ok, device: { ...IPHONE, deviceScaleFactor: 1 } });
  const { page, errors } = app;
  await page.waitForFunction(() => window.__mc.MATCHES.length > 0 && /-/.test(window.__mc.MATCHES[0].id), null, { timeout: 30000 });
  await racingMatch(page, { variant: 'matchday', format: 'story' });

  /* ---------- A. picker ---------- */
  await page.locator('#section-tabs .tab[data-s="match"]').tap();
  await page.locator('#mp-toggle').tap();
  await page.waitForSelector('.mp-thumb', { timeout: 10000 });
  const grid = await page.evaluate(() => ({
    sets: [...document.querySelectorAll('.mp-set')].map(e => e.textContent.trim()),
    n: document.querySelectorAll('.mp-thumb').length,
    lazy: [...document.querySelectorAll('.mp-thumb img')].every(i => i.getAttribute('loading') === 'lazy'),
  }));
  check(engine, 'grille des photos du match', grid.n === 58 && grid.lazy && /Racing LS II/.test(grid.sets[0] || ''), JSON.stringify(grid));
  await page.locator(`.mp-thumb[data-mp="${PHOTO}"]`).scrollIntoViewIfNeeded();
  await page.locator(`.mp-thumb[data-mp="${PHOTO}"]`).tap();
  await page.waitForFunction(() => !!document.querySelector('#poster-root img[data-photo-layer]'), null, { timeout: 15000 });
  let s = await st(page);
  check(engine, 'photo choisie = chemin, pas une dataURL',
    s.heroPhoto && s.heroPhoto.url === `photos/${SET}/${PHOTO}.webp` && !JSON.stringify(s.heroPhoto).includes('data:'), JSON.stringify(s.heroPhoto));
  const snapLen = await page.evaluate(() => { const k = localStorage.getItem('fca-mc:v1:last'); const v = localStorage.getItem(k) || ''; return { len: v.length, data: v.includes('data:image') }; });
  check(engine, 'snapshot léger (aucune image dedans)', !snapLen.data && snapLen.len < 20000, JSON.stringify(snapLen));
  const tools = await page.evaluate(() => ({ visible: !document.getElementById('photo-tools').hidden, pannable: document.getElementById('preview-tap').classList.contains('pannable') }));
  check(engine, 'barre de cadrage affichée', tools.visible && tools.pannable, JSON.stringify(tools));

  /* every variant that carries a visual shows the photo, both formats where they exist */
  const CARDS = [['matchday', 'story'], ['matchday', 'post'], ['kickoff', 'story'], ['live-score', 'story'],
    ['goal', 'story'], ['halftime', 'story'], ['recap', 'story'], ['recap', 'post']];
  for (const [v, f] of CARDS) {
    await setCard(page, v, f);
    const p = await previewPhoto(page);
    check(engine, `photo plein cadre sur ${v} ${f}`, !!p && p.isData && p.w >= p.W && p.h >= p.H, JSON.stringify(p));
  }
  /* CSC goal card too */
  await page.evaluate(() => { const S = window.__mc.state; S.variant = 'goal'; S.scorerId = 'csc'; S.goals.push({ minute: 88, playerId: 'csc', side: 'home', ts: 9 }); syncScoreFromGoals(); renderAll(); });
  check(engine, 'photo plein cadre sur le but CSC', !!(await previewPhoto(page)));
  await racingMatch(page, { variant: 'live-score', format: 'story' });

  /* ---------- B. drag ---------- */
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  const box = await page.locator('#preview-tap .preview-inner').boundingBox();
  const before = await previewPhoto(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx - i * 8, cy + i * 6);
  await page.mouse.up();
  await sleep(500);
  let after = await previewPhoto(page);
  s = await st(page);
  const overlay = await page.evaluate(() => !!document.getElementById('poster-overlay'));
  /* a 2:3 photo in a 9:16 story at 100 %: only the horizontal axis has room */
  check(engine, 'glisser (souris) déplace la photo', after.left < before.left && s.pos.x > 50 && after.top === 0 && !overlay,
    `left ${before.left} → ${after.left}, pos ${JSON.stringify(s.pos)}, tiroir ${overlay}`);
  check(engine, 'jamais de bord découvert', after.left <= 0 && after.top <= 0 && after.left + after.w >= after.W && after.top + after.h >= after.H, JSON.stringify(after));
  /* far drag: clamped at the edge */
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 30, cy);
  await page.mouse.up(); await sleep(400);
  after = await previewPhoto(page); s = await st(page);
  check(engine, 'butée au bord gauche de la photo', after.left === 0 && s.pos.x === 0, `left ${after.left}, pos ${JSON.stringify(s.pos)}`);
  /* zoomed in, both axes have room */
  await page.evaluate(() => { window.__mc.state.visualZoom = 150; refresh(); });
  const z0 = await previewPhoto(page);
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx - i * 6, cy - i * 9);
  await page.mouse.up(); await sleep(400);
  const z1 = await previewPhoto(page);
  check(engine, 'zoomée : glisser en diagonale', z1.left < z0.left && z1.top < z0.top, `(${z0.left},${z0.top}) → (${z1.left},${z1.top})`);
  await page.evaluate(() => { window.__mc.state.visualZoom = 100; window.__mc.state.visualPos = { x: 50, y: 22 }; refresh(); });
  if (engine === 'chromium') {
    /* a real finger: CDP touch events */
    const cdp = await page.context().newCDPSession(page);
    const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const x0 = (await st(page)).pos.x;
    await t('touchStart', cx, cy);
    for (let i = 1; i <= 8; i++) await t('touchMove', cx - i * 6, cy);
    await t('touchEnd');
    await sleep(500);
    const x1 = (await st(page)).pos.x;
    const ov = await page.evaluate(() => !!document.getElementById('poster-overlay'));
    check(engine, 'glisser (doigt) déplace la photo', x1 > x0 && !ov, `pos.x ${x0} → ${x1}, tiroir ${ov}`);
    await page.evaluate(() => { window.__mc.state.visualPos = { x: 50, y: 22 }; refresh(); });
  }
  /* a plain tap still exports */
  const tap = await exportViaTap(page);
  check(engine, 'un tap exporte toujours', tap.status === 'ok' && !tap.png.blank, tap.status + ' ' + (tap.message || ''));

  /* ---------- C. size, effects, Recentrer ---------- */
  const w100 = (await previewPhoto(page)).w;
  await page.locator('#pt-zoom').fill('250');
  await sleep(450);
  after = await previewPhoto(page); s = await st(page);
  check(engine, 'curseur Taille → 250 %', s.zoom === 250 && Math.abs(after.w / w100 - 2.5) < 0.01, `zoom ${s.zoom}, largeur ${w100} → ${after.w}`);
  await page.locator('#pt-zoom').fill('300');
  await sleep(450);
  check(engine, 'Taille plafonnée à 300 %', (await st(page)).zoom === 300);
  const veils = () => page.evaluate(() => [...document.querySelectorAll('#poster-root #poster-node div')]
    .map(d => d.getAttribute('style') || '').filter(x => /linear-gradient\(180deg, (transparent|rgba\(4,8,15,[0-9.]+\)) 0%/.test(x)).map(x => x.slice(0, 160)));
  const v100 = await veils();
  await page.locator('#pt-fx').fill('0');
  await sleep(300);
  const v0 = await veils(); s = await st(page);
  check(engine, 'Effets → photo pure', s.fx === 0 && v0.every(x => !/rgba\(4,8,15,0\.[1-9]/.test(x)) && v0.length === v100.length, JSON.stringify(v0));
  await page.locator('#pt-fx').fill('200');
  await sleep(300);
  s = await st(page);
  const tint = await page.evaluate(() => [...document.querySelectorAll('#poster-root #poster-node div')].some(d => /background:rgba\(12,44,104,0\.34\)/.test(d.getAttribute('style') || '')));
  check(engine, 'Effets → dominants (voiles + nappe bleu nuit)', s.fx === 200 && tint);
  await page.locator('#pt-fx').fill('104');
  await sleep(300);
  s = await st(page);
  const vBack = await veils();
  check(engine, 'Effets aimanté sur le défaut (= look d\'avant)', s.fx === 100 && JSON.stringify(vBack) === JSON.stringify(v100));
  await page.locator('#pt-recenter').tap();
  await sleep(300);
  s = await st(page); after = await previewPhoto(page);
  check(engine, 'Recentrer', s.zoom === 100 && s.pos.x === 50 && s.pos.y === 22 && after.w === w100, JSON.stringify(s.pos) + ' ' + s.zoom);

  /* ---------- D. relaunch ---------- */
  await page.evaluate(() => { Object.assign(window.__mc.state, { visualPos: { x: 30, y: 64 }, visualZoom: 170, visualFx: 55 }); refresh(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#poster-root img[data-photo-layer]'), null, { timeout: 20000 });
  s = await st(page);
  check(engine, 'relance : photo + cadrage repris', s.heroPhoto && s.heroPhoto.id === PHOTO && s.pos.x === 30 && s.pos.y === 64 && s.zoom === 170 && s.fx === 55, JSON.stringify(s));

  /* ---------- E. another visual resets the framing ---------- */
  await page.evaluate(() => setHeroPlayer(window.__mc.ROSTER.find(p => p._active !== false && p.cutoutUrl).id));
  s = await st(page);
  const toolsOff = await page.evaluate(() => document.getElementById('photo-tools').hidden && !document.getElementById('preview-tap').classList.contains('pannable'));
  check(engine, 'autre visuel : cadrage remis à zéro, effets gardés, barre masquée', !s.heroPhoto && s.zoom === 100 && s.pos.x === 50 && s.pos.y === 22 && s.fx === 55 && toolsOff, JSON.stringify(s));
  await page.evaluate(async () => { await loadMatchPhotoManifest(); setHeroPhoto('racing-2510', 'dsc-2542'); });
  await page.waitForFunction(() => !!document.querySelector('#poster-root img[data-photo-layer]'), null, { timeout: 15000 });
  /* landscape photo in a story: the horizontal axis has room at 100 % */
  const lb = await previewPhoto(page);
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx + i * 10, cy);
  await page.mouse.up(); await sleep(400);
  const la = await previewPhoto(page);
  check(engine, 'photo paysage : glisser horizontal', la.left > lb.left && la.top === 0, `left ${lb.left} → ${la.left}`);

  /* ---------- F. export = preview ---------- */
  await page.evaluate(() => setHeroPhoto('racing-2510', 'dsc-2532'));
  await page.waitForFunction(() => !!document.querySelector('#poster-root img[data-photo-layer]'), null, { timeout: 15000 });
  const SETTINGS = {
    defaut: { visualPos: { x: 50, y: 22 }, visualZoom: 100, visualFx: 100 },
    cadre: { visualPos: { x: 72, y: 58 }, visualZoom: 165, visualFx: 45 },
    dominant: { visualPos: { x: 40, y: 30 }, visualZoom: 130, visualFx: 190 },
  };
  const PARITY = [['matchday', 'story'], ['matchday', 'post'], ['live-score', 'story'], ['goal', 'story'], ['halftime', 'story'], ['recap', 'story'], ['recap', 'post']];
  for (const [sk, sv] of Object.entries(SETTINGS)) {
    for (const [v, f] of PARITY) {
      if (sk === 'dominant' && !['matchday-story', 'live-score-story', 'recap-post'].includes(`${v}-${f}`)) continue;
      await racingMatch(page, { variant: v, format: f, ...sv });
      await sleep(250);
      const exported = await exportDirect(page);
      const shot = await browserShot(page);
      const r = await compare(page, exported, shot);
      /* same thresholds as tests/parity.mjs */
      const ok = r.sameSize && r.mean < 7 && r.worstCell < 30;
      check(engine, `export = aperçu · ${sk} · ${v} ${f}`, ok, `écart moyen ${r.mean}/255 · pire zone ${r.worstCell}/255 (case ${r.worstAt})`);
      if (!ok) {
        fs.writeFileSync(path.join(OUT_DIR, `photos-${engine}-${sk}-${v}-${f}-export.png`), exported);
        fs.writeFileSync(path.join(OUT_DIR, `photos-${engine}-${sk}-${v}-${f}-browser.png`), shot);
      }
      if (doExport && engine === 'chromium') {
        fs.mkdirSync(VALID, { recursive: true });
        fs.writeFileSync(path.join(VALID, `${sk}-${v}-${f}.png`), exported);
      }
    }
  }
  const pageErrors = errors.filter(e => e.kind === 'pageerror');
  check(engine, 'aucune erreur JS', !pageErrors.length, JSON.stringify(pageErrors.slice(0, 3)));
  await app.close();
}
await srv.close();
console.log(failures ? `\n✗ ${failures} échec(s)` : '\n✓ photos du match + cadrage OK');
process.exit(failures ? 1 : 0);
